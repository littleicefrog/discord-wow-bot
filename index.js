const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');

// Global variables for dynamic ESM modules
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

// Automation Process Function
async function processRaidbotsTask(message, raidbotsUrl) {
  const replyMsg = await message.reply('⏳ Fetching Raidbots character name...');

  let browser;
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

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Block heavy media (Images/Fonts)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // --- STEP 1: Fetch Character Name directly from Raidbots Link ---
    console.log(`🔎 Reading character name from Raidbots Link: ${raidbotsUrl}`);
    await page.goto(raidbotsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('h1, header, .character-name', { timeout: 15000 }).catch(() => {});

    const characterName = await page.evaluate(() => {
      const titleText = document.title;
      // Extract name from title e.g. "Droptimizer - Cobrapl - US-Illidan"
      const titleMatch = titleText.match(/-\s*([A-Za-z0-9]+)\s*-/);
      if (titleMatch && titleMatch[1]) {
        return titleMatch[1].trim();
      }

      const headings = Array.from(document.querySelectorAll('h1, h2, header'));
      for (const h of headings) {
        if (h.textContent && h.textContent.trim().length > 0) {
          const firstWord = h.textContent.trim().split(/[\s-]+/)[0];
          if (firstWord && firstWord.length > 2) return firstWord;
        }
      }

      return null;
    });

    if (!characterName) {
      throw new Error("Could not extract WoW Character Name from the provided Raidbots link!");
    }

    const cleanCharName = characterName.toLowerCase().trim();
    console.log(`✅ Extracted Character Name: "${cleanCharName}"`);
    await replyMsg.edit(`⏳ Found Character: **${characterName}**. Navigating to WoWUtils...`);

    // --- STEP 2: Navigate to WoWUtils ---
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

    console.log('📍 Navigating to WoWUtils Loot Tab...');
    const wishlistUrl = 'https://wowutils.com/viserio-cooldowns/groups/6a809e90d1367bdf94b86464?tab=loot';
    await page.goto(wishlistUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // --- STEP 3: Click "Team" Tab ---
    console.log('👆 Waiting for "Team" tab to be clickable...');
    await page.waitForFunction(() => {
      const elements = Array.from(document.querySelectorAll('button, a, div, span'));
      return elements.some(e => e.textContent.trim() === 'Team');
    }, { timeout: 30000 });

    const teamClicked = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('button, a, div, span'));
      const teamEl = allElements.find(e => e.textContent.trim() === 'Team');
      if (teamEl) {
        teamEl.click();
        return true;
      }
      return false;
    });

    if (!teamClicked) {
      throw new Error("Team tab not found on WoWUtils page!");
    }

    console.log('✅ Clicked "Team" tab.');
    await new Promise(r => setTimeout(r, 2000));

    // --- STEP 3.5: Click "Droptimizers" Sub-Tab ---
    console.log('👆 Clicking "Droptimizers" tab...');
    await page.waitForFunction(() => {
      const elements = Array.from(document.querySelectorAll('button, a, div, span'));
      return elements.some(e => e.textContent.trim() === 'Droptimizers');
    }, { timeout: 20000 });

    const droptimizersClicked = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('button, a, div, span'));
      const dropEl = allElements.find(e => e.textContent.trim() === 'Droptimizers');
      if (dropEl) {
        dropEl.click();
        return true;
      }
      return false;
    });

    if (!droptimizersClicked) {
      throw new Error('Droptimizers tab not found!');
    }

    console.log('✅ Clicked "Droptimizers" tab.');
    await new Promise(r => setTimeout(r, 3000));

    // --- STEP 4: Search Member Row & Click Upload Arrow ---
    console.log(`🔍 Searching for Upload Icon next to member "${cleanCharName}"...`);

    const clickResult = await page.evaluate((targetChar) => {
      const allRows = Array.from(document.querySelectorAll('tr, div'));

      const matchedRow = allRows.reverse().find(el => {
        const text = el.innerText || el.textContent || '';
        return text.toLowerCase().includes(targetChar) && el.querySelector('button, svg');
      });

      if (!matchedRow) {
        return { success: false, reason: `Character name "${targetChar}" not found in Team table` };
      }

      const buttons = Array.from(matchedRow.querySelectorAll('button, svg, a'));

      let uploadBtn = buttons.find(btn => {
        const html = btn.outerHTML || '';
        if (html.includes('trash') || html.includes('delete')) return false;
        return true;
      });

      if (uploadBtn) {
        if (uploadBtn.tagName === 'SVG' && uploadBtn.parentElement) {
          uploadBtn.parentElement.click();
        } else {
          uploadBtn.click();
        }
        return { success: true };
      }

      return { success: false, reason: 'Upload button/icon not found inside character row' };
    }, cleanCharName);

    if (!clickResult.success) {
      throw new Error(`Could not click upload button for "${characterName}". (${clickResult.reason})`);
    }

    console.log('✅ Clicked Upload Arrow icon successfully!');

    // --- STEP 5: Enter Raidbots Link into Modal ---
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

    // --- STEP 6: Click "Fetch Report" ---
    console.log('👆 Step 1: Clicking "Fetch Report"...');
    const clickedFetch = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const fetchBtn = buttons.find(b => b.textContent.includes('Fetch Report'));
      if (fetchBtn) {
        fetchBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedFetch) {
      await page.keyboard.press('Enter');
    }

    // --- STEP 7: Wait and Click final "Import" Button ---
    console.log('⏳ Waiting for "Import" button to appear on 2nd screen...');
    
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.textContent.trim() === 'Import');
    }, { timeout: 25000 });

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