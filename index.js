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

    // Wait for the main title/character name to render on Raidbots page
    await page.waitForSelector('h1, header, .character-name', { timeout: 15000 }).catch(() => {});

    const characterName = await page.evaluate(() => {
      // Extract character name from title or page text
      const pageText = document.body.innerText;
      const titleText = document.title;
      
      // Raidbots page title format usually: "Droptimizer - CharacterName - Realm" or similar
      const titleMatch = titleText.match(/-\s*([A-Za-z0-9]+)\s*-/);
      if (titleMatch && titleMatch[1]) {
        return titleMatch[1].trim();
      }

      // Fallback: Check h1 or heading tags
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
    console.log('👆 Clicking Team tab...');
    await page.waitForFunction(() => {
      const elements = Array.from(document.querySelectorAll('button, a, div, span'));
      return elements.some(e => e.textContent.trim() === 'Team');
    }, { timeout: 30000 });

    const teamTabElement = await page.evaluateHandle(() => {
      const elements = Array.from(document.querySelectorAll('button, a, div, span'));
      return elements.find(e => e.textContent.trim() === 'Team');
    });

    if (teamTabElement) {
      await teamTabElement.click();
    } else {
      throw new Error("Team tab not found!");
    }

    await new Promise(r => setTimeout(r, 1500));

    // --- STEP 4: Find Member Row matching Character Name & Click Upload Icon ---
    console.log(`🔍 Searching for Member row matching "${cleanCharName}"...`);
    await page.waitForSelector('tr, div', { timeout: 15000 });

    const uploadClicked = await page.evaluate((targetChar) => {
      const allRows = Array.from(document.querySelectorAll('tr, div'));
      
      // Find row containing the character name
      const matchedRow = allRows.find(row => {
        const text = row.textContent.toLowerCase();
        return text.includes(targetChar);
      });

      if (matchedRow) {
        // Find upload icon/button inside this row
        const parentRow = matchedRow.closest('tr') || matchedRow;
        const uploadBtn = parentRow.querySelector('button, svg, a');
        if (uploadBtn) {
          uploadBtn.click();
          return true;
        }
      }
      return false;
    }, cleanCharName);

    if (!uploadClicked) {
      throw new Error(`Could not find character "${characterName}" or upload icon in WoWUtils Team table!`);
    }

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

    // --- STEP 6: Submit / Fetch Report ---
    console.log('👆 Clicking Fetch Report / Import button...');
    const clickedFetch = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const fetchBtn = buttons.find(b => 
        b.textContent.includes('Fetch Report') || 
        b.textContent.includes('Import') ||
        b.textContent.includes('Submit') ||
        b.textContent.includes('Upload')
      );
      if (fetchBtn) {
        fetchBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedFetch) {
      await page.keyboard.press('Enter');
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