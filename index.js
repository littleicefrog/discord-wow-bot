const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');
const http = require('http');

// 1. Dummy Web Server for Render Health Check / Port Scan (Free Tier)
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

  // Check if the message contains a Raidbots Droptimizer link
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

      // Block images, fonts, media, and analytics to speed up loading and prevent network timeouts
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Pre-set session cookie before visiting the page
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
      
      // Wait for the Import button to appear (Max 20 seconds)
      let imported = false;
      try {
        await page.waitForFunction(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.some(b => b.textContent.includes('Import droptimizer'));
        }, { timeout: 20000 });

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
        throw new Error("Import droptimizer button not found. The cookie may be expired or invalid.");
      }

      console.log('✍️ Typing Raidbots URL...');
      const linkInputSelector = 'input'; 
      await page.waitForSelector(linkInputSelector, { timeout: 10000 });
      await page.type(linkInputSelector, raidbotsUrl);

      console.log('👆 Clicking Fetch Report button...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const fetchBtn = buttons.find(b => b.textContent.includes('Fetch Report') || b.textContent.includes('Import'));
        if (fetchBtn) fetchBtn.click();
      });

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

      // Auto delete original message and reply message after 5 seconds
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