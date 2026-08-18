const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const http = require('http');
const fs = require('fs');

let puppeteer;
let queue;

// 1. Dummy Web Server for Render Health Check
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot is alive!');
}).listen(PORT, () => {
  console.log(`Dummy web server listening on port ${PORT}`);
});

// 2. Discord Bot Client Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Helper function to force dismiss Cookie Banner or remove it from DOM
async function dismissCookieBanner(page) {
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const acceptBtn = buttons.find(b => {
        const txt = (b.textContent || '').toLowerCase().trim();
        return txt === 'accept all' || txt.includes('accept');
      });
      if (acceptBtn) acceptBtn.click();

      const overlayElements = Array.from(document.querySelectorAll('div, section, iframe')).filter(el => {
        const txt = (el.textContent || '').toLowerCase();
        return txt.includes('we value your privacy') || txt.includes('our 1015 partners') || txt.includes('cookie policy');
      });

      overlayElements.forEach(el => {
        const modal = el.closest('div[class*="cookie"], div[class*="modal"], div[class*="banner"], div[style*="z-index"]') || el;
        modal.remove();
      });
    });
    await new Promise(r => setTimeout(r, 1500));
  } catch (e) {
    // Ignore error
  }
}

// Automation Process Function
async function processRaidbotsTask(message, raidbotsUrl) {
  const replyMsg = await message.reply('⏳ Fetching Raidbots character name...');

  let browser;
  let page;
  try {
    console.log(`🚀 Launching Chromium for ${message.author.tag}...`);
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--js-flags=--max-old-space-size=256'
      ]
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Block heavy media
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // --- STEP 1: Fetch Character Name Fast ---
    console.log(`🔎 Reading character name from Raidbots Link: ${raidbotsUrl}`);
    
    // Fast Strategy 1: Page Navigation with Light Wait
    let characterName = null;
    try {
      await page.goto(raidbotsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));

      characterName = await page.evaluate(() => {
        const titleText = document.title;
        const titleMatch = titleText.match(/-\s*([A-Za-z0-9]+)\s*-/);
        if (titleMatch && titleMatch[1]) return titleMatch[1].trim();

        const headings = Array.from(document.querySelectorAll('h1, h2, header, .character-name'));
        for (const h of headings) {
          if (h.textContent && h.textContent.trim().length > 0) {
            const firstWord = h.textContent.trim().split(/[\s-]+/)[0];
            if (firstWord && firstWord.length > 2 && firstWord.toLowerCase() !== 'raidbots') return firstWord;
          }
        }
        return null;
      });
    } catch (e) {
      console.log('⚠️ Page load timeout on Raidbots, attempting fallback parsing...');
    }

    if (!characterName) {
      throw new Error("Could not extract WoW Character Name from Raidbots link! Please check if the link is valid.");
    }

    const cleanCharName = characterName.toLowerCase().trim();
    console.log(`✅ Extracted Character Name: "${cleanCharName}"`);
    await replyMsg.edit(`⏳ Found Character: **${characterName}**. Navigating to WoWUtils...`);

    // --- STEP 2: Navigate with Session Cookie ---
    if (!process.env.SESSION_COOKIE) {
      throw new Error("SESSION_COOKIE environment variable is missing on Render!");
    }

    await page.setCookie({
      name: '__Secure-next-auth.session-token',
      value: process.env.SESSION_COOKIE.trim(),
      domain: '.wowutils.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax'
    });

    console.log('📍 Navigating to WoWUtils Group Hub Page...');
    await page.goto('https://wowutils.com/viserio-cooldowns/groups/6a809e90d1367bdf94b86464', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await dismissCookieBanner(page);

    // --- STEP 2.5: Navigation Sequence: TRACKING > Loot > Team > Droptimizers ---
    console.log('👆 Step A: Clicking "Loot"...');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div, span'));
      const lootBtn = elements.find(el => el.textContent && el.textContent.trim().toLowerCase() === 'loot');
      if (lootBtn) lootBtn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    await dismissCookieBanner(page);

    console.log('👆 Step B: Clicking "Team"...');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div, span'));
      const teamBtn = elements.find(el => el.textContent && el.textContent.trim().toLowerCase() === 'team');
      if (teamBtn) teamBtn.click();
    });

    await new Promise(r => setTimeout(r, 2000));

    console.log('👆 Step C: Clicking "Droptimizer"...');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div, span'));
      const dropBtn = elements.find(el => el.textContent && el.textContent.trim().toLowerCase().includes('droptimizer'));
      if (dropBtn) dropBtn.click();
    });

    console.log('⏳ Waiting for Droptimizer table to load...');
    await new Promise(r => setTimeout(r, 4000));
    await dismissCookieBanner(page);

    // --- STEP 3: Search Character Row & Click Upload Icon ---
    console.log(`🔍 Locating character row for "${cleanCharName}"...`);

    const clickResult = await page.evaluate((targetChar) => {
      const allElements = Array.from(document.querySelectorAll('*'));
      
      const nameEl = allElements.find(el => {
        return el.children.length === 0 && el.textContent.toLowerCase().trim() === targetChar;
      }) || allElements.find(el => el.textContent.toLowerCase().includes(targetChar));

      if (!nameEl) {
        return { success: false, reason: `Character "${targetChar}" not found on page.` };
      }

      const row = nameEl.closest('tr, div[class*="row"], div[class*="item"], li');
      if (!row) {
        return { success: false, reason: 'Parent row container not found.' };
      }

      const uploadBtn = row.querySelector('button, svg, a[aria-label*="upload"]');
      if (uploadBtn) {
        if (uploadBtn.tagName === 'SVG' && uploadBtn.parentElement) {
          uploadBtn.parentElement.click();
        } else {
          uploadBtn.click();
        }
        return { success: true };
      }

      return { success: false, reason: 'Upload button icon not detected inside the row.' };
    }, cleanCharName);

    if (!clickResult.success) {
      throw new Error(`Could not click upload button for "${characterName}". (${clickResult.reason})`);
    }

    console.log('✅ Clicked Upload Arrow icon successfully!');

    // --- STEP 4: Enter Raidbots Link into Modal ---
    console.log('⌛ Waiting for modal input field...');
    const inputElement = await page.waitForSelector('input', { timeout: 20000 });

    console.log('✍️ Typing Raidbots URL...');
    await inputElement.focus();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(raidbotsUrl, { delay: 10 });

    await new Promise(r => setTimeout(r, 1000));

    // --- STEP 5: Click "Fetch Report" ---
    console.log('👆 Step 1: Clicking "Fetch Report"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const fetchBtn = buttons.find(b => b.textContent.includes('Fetch Report'));
      if (fetchBtn) fetchBtn.click();
    });

    await page.keyboard.press('Enter');

    // --- STEP 6: Wait and Click final "Import" Button ---
    console.log('⏳ Waiting for "Import" button...');
    
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.textContent.trim() === 'Import');
    }, { timeout: 60000 });

    console.log('👆 Step 2: Clicking final "Import" button...');
    const clickedImport = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const importBtn = buttons.find(b => b.textContent.trim() === 'Import');
      if (importBtn) {
        importBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedImport) {
      throw new Error('Failed to click final "Import" button!');
    }

    await new Promise(r => setTimeout(r, 5000));

    await replyMsg.edit(`✅ Completed droptimizer import for **${characterName}**!`);
    console.log('🎉 Task completed successfully!');

  } catch (error) {
    console.error('❌ Detailed Error Log:', error.message || error);
    
    if (page) {
      try {
        const screenshotPath = 'error.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const attachment = new AttachmentBuilder(screenshotPath);
        await message.channel.send({ 
          content: `❌ **Debug Snapshot:** Current browser state attached below. (${error.message || 'Error occurred'})`, 
          files: [attachment] 
        });
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
      } catch (screenshotError) {
        console.error('Failed to capture screenshot:', screenshotError);
      }
    }

    await replyMsg.edit(`❌ Failed to process: ${error.message || 'Unknown Error'}`);
  } finally {
    if (browser) {
      console.log('🧹 Closing browser...');
      await browser.close().catch(() => {});
    }

    setTimeout(async () => {
      if (message.deletable) await message.delete().catch(() => {});
      if (replyMsg.deletable) await replyMsg.delete().catch(() => {});
    }, 5000);
  }
}

// Dynamic Imports & Initialize Bot
async function init() {
  const puppeteerModule = await import('puppeteer');
  puppeteer = puppeteerModule.default || puppeteerModule;

  const pQueueModule = await import('p-queue');
  const PQueue = pQueueModule.default.default || pQueueModule.default || pQueueModule;
  queue = new PQueue({ concurrency: 1 });

  // 3. Bot Online Event
  client.once('clientReady', () => {
    console.log('========================================');
    console.log(`✅ Success! Bot is online as: ${client.user.tag}`);
    console.log('========================================');
  });

  // 4. Message Listener
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.includes('raidbots.com/simbot/report/')) {
      console.log(`📩 New Raidbots link received from ${message.author.tag}`);
      const raidbotsUrl = message.content.trim();

      queue.add(() => processRaidbotsTask(message, raidbotsUrl));
    }
  });

  process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Error:', error);
  });

  client.login(process.env.DISCORD_TOKEN);
}

init();