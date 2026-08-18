const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');
const http = require('http');

// 1. Render Health Check / Port Scan အတွက် Dummy Web Server
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
  console.log(`✅ Success! Bot Online ဖြစ်သွားပါပြီ: ${client.user.tag}`);
  console.log('========================================');
});

// 4. Message Listener
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.includes('raidbots.com/simbot/report/')) {
    const raidbotsUrl = message.content.trim();
    const replyMsg = await message.reply('⏳ Processing...');

    let browser;
    try {
      console.log('🚀 Launching Chromium with low-memory args...');
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
          '--js-flags=--max-old-space-size=256' // RAM စားနည်းအောင် ကန့်သတ်ခြင်း
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // CSS/Images များကို Block လုပ်၍ RAM နှင့် Speed ပိုမြန်အောင်ပြုလုပ်ခြင်း
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      console.log('📍 Navigating to WoWUtils...');
      const wishlistUrl = 'https://wowutils.com/viserio-cooldowns/groups/6a809e90d1367bdf94b86464?tab=loot';
      await page.goto(wishlistUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      console.log('🔑 Setting session cookie...');
      if (!process.env.SESSION_COOKIE) {
        throw new Error("Render ထဲတွင် SESSION_COOKIE variable မရှိပါ!");
      }

      await page.setCookie({
        name: '__Secure-next-auth.session-token',
        value: process.env.SESSION_COOKIE.trim(),
        path: '/',
        domain: 'wowutils.com',
        secure: true,
        httpOnly: true
      });

      console.log('🔄 Reloading page...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });

      console.log('👆 Looking for Import droptimizer button...');
      await new Promise(r => setTimeout(r, 4000));
      
      const imported = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => b.textContent.includes('Import droptimizer'));
        if (targetBtn) {
          targetBtn.click();
          return true;
        }
        return false;
      });

      if (!imported) {
        throw new Error("Cookie expired or Import button not found.");
      }

      console.log('✍️ Typing Raidbots URL...');
      const linkInputSelector = 'input'; 
      await page.waitForSelector(linkInputSelector, { timeout: 10000 });
      await page.type(linkInputSelector, raidbotsUrl);

      console.log('👆 Clicking Fetch Report button...');
      const submitBtnSelector = 'button::-p-text(Fetch Report)'; 
      await page.waitForSelector(submitBtnSelector, { timeout: 5000 });
      await page.click(submitBtnSelector);

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

      // Success ဖြစ်ဖြစ် Fail ဖြစ်ဖြစ် ၅ စက္ကန့်အကြာတွင် Auto Delete လုပ်ခြင်း
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