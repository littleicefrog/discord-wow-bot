const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');
const http = require('http');

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
    const replyMsg = await message.reply('⏳ Processing...');

    let browser;
    try {
      console.log('🚀 Launching Chromium...');
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

      // Pre-set session cookie
      console.log('🔑 Pre-setting session cookie...');
      if (!process.env.SESSION_COOKIE) {
        throw new Error("SESSION_COOKIE environment variable is missing on Render!");
      }

      const cleanCookie = process.env.SESSION_COOKIE.trim();

      await page.setCookie({
        name: '__Secure-next-auth.session-token',
        value: cleanCookie,
        domain: '.wowutils.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax'
      });

      console.log('📍 Navigating to WoWUtils Loot Tab...');
      const wishlistUrl = 'https://wowutils.com/viserio-cooldowns/groups/6a809e90d1367bdf94b86464?tab=loot';
      await page.goto(wishlistUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

      console.log('👆 Waiting for Import droptimizer button...');
      
      let imported = false;
      try {
        await page.waitForFunction(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.some(b => b.textContent.includes('Import droptimizer'));
        }, { timeout: 30000 });

        imported = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const targetBtn = buttons.find(b => b.textContent.includes('Import droptimizer'));
          if (targetBtn) {
            targetBtn.click();
            return true;
          }
          return false;
        });
      } catch (e) {
        imported = false;
      }

      if (!imported) {
        throw new Error("Import droptimizer button not found. Please refresh your SESSION_COOKIE in Render.");
      }

      console.log('⌛ Waiting for modal overlay to open...');
      await new Promise(r => setTimeout(r, 2000));

      console.log('✍️ Locating and filling Raidbots URL...');
      // Flexible Selector Detection inside DOM
      const inputSelector = await page.evaluate(() => {
        const allInputs = Array.from(document.querySelectorAll('input, textarea'));
        if (allInputs.length > 0) {
          const visibleInput = allInputs.find(i => i.offsetWidth > 0 && i.offsetHeight > 0) || allInputs[0];
          visibleInput.focus();
          return true;
        }
        return false;
      });

      if (!inputSelector) {
        throw new Error("Could not find any input field in the modal.");
      }

      // Type the link into the focused element directly
      await page.keyboard.type(raidbotsUrl, { delay: 10 });
      await new Promise(r => setTimeout(r, 1000));

      console.log('👆 Clicking Fetch Report button...');
      const clickedFetch = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const fetchBtn = buttons.find(b => 
          b.textContent.includes('Fetch Report') || 
          b.textContent.includes('Import') ||
          b.textContent.includes('Submit')
        );
        if (fetchBtn) {
          fetchBtn.click();
          return true;
        }
        return false;
      });

      if (!clickedFetch) {
        console.log('⚠️ Fetch button not found via text, pressing Enter key...');
        await page.keyboard.press('Enter');
      }

      await new Promise(r => setTimeout(r, 5000));

      await replyMsg.edit('✅ Completed!');
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
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Error:', error);
});

client.login(process.env.DISCORD_TOKEN);