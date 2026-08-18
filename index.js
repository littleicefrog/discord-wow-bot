const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');
const http = require('http');

// 1. Render Health Check / Port Scan အတွက် Dummy Web Server ဖွင့်ခြင်း (Free Tier အတွက်)
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

  // Discord Channel ထဲသို့ Raidbots Droptimizer Link ရောက်လာပါက စစ်ဆေးခြင်း
  if (message.content.includes('raidbots.com/simbot/report/')) {
    const raidbotsUrl = message.content.trim();
    const replyMsg = await message.reply('⏳ Processing...');

    let browser;
    try {
      console.log('🚀 Starting Puppeteer browser...');
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
          '--single-process'
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Step A: Wishlist Page သို့ သွားခြင်း (Network ငြိမ်အောင် အချိန်အနည်းငယ်စောင့်မည်)
      console.log('📍 Navigating to WoWUtils page...');
      const wishlistUrl = 'https://wowutils.com/viserio-cooldowns/groups/6a809e90d1367bdf94b86464?tab=loot';
      await page.goto(wishlistUrl, { waitUntil: 'commit', timeout: 60000 });

      // Step B: Session Cookie ထည့်သွင်းခြင်း
      console.log('🔑 Setting session cookie...');
      await page.setCookie({
        name: '__Secure-next-auth.session-token',
        value: process.env.SESSION_COOKIE,
        path: '/',
        secure: true,
        httpOnly: true
      });

      // Cookie အကျိုးသက်ရောက်ရန် Reload ပြုလုပ်ခြင်း
      console.log('🔄 Reloading page to apply cookie...');
      await page.reload({ waitUntil: 'commit', timeout: 60000 });

      // Step C: Cookie/Privacy Banner ပေါ်လာပါက "Accept All" ကို နှိပ်ပေးခြင်း
      try {
        const acceptCookieBtn = await page.waitForSelector('button::-p-text(Accept All)', { timeout: 5000 });
        if (acceptCookieBtn) {
          await acceptCookieBtn.click();
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (e) {
        console.log("Cookie Banner မပေါ်ပါ သို့မဟုတ် ကျော်သွားပါပြီ။");
      }

      // Step D: "Import droptimizer" ခလုတ်ကို နှိပ်ခြင်း
      console.log('👆 Clicking Import droptimizer button...');
      await new Promise(r => setTimeout(r, 3000)); // Page element တွေ အပြည့်အဝ တက်လာအောင် ခဏစောင့်မည်
      
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
        throw new Error("Import droptimizer button ကို ရှာမတွေ့ပါ (SESSION_COOKIE မဝင်ထားခြင်း သို့မဟုတ် သက်တမ်းကုန်နေခြင်း ဖြစ်နိုင်သည်)");
      }

      // Step E: Modal ပွင့်လာပြီး Link ထည့်ခြင်း
      console.log('✍️ Typing Raidbots URL...');
      const linkInputSelector = 'input'; 
      await page.waitForSelector(linkInputSelector, { timeout: 10000 });
      await page.type(linkInputSelector, raidbotsUrl);

      // Step F: Fetch / Import ခလုတ်ကို နှိပ်ခြင်း
      console.log('👆 Clicking Fetch Report button...');
      const submitBtnSelector = 'button::-p-text(Fetch Report)'; 
      await page.waitForSelector(submitBtnSelector, { timeout: 5000 });
      await page.click(submitBtnSelector);

      // Step G: Process ပြီးဆုံးသည်အထိ ၅ စက္ကန့် စောင့်ခြင်း
      await new Promise(r => setTimeout(r, 5000));

      await replyMsg.edit('✅ Completed!');
      console.log('🎉 Task completed successfully!');

    } catch (error) {
      console.error('❌ Automation Error Details:', error);
      await replyMsg.edit('❌ Failed to process the Raidbots link.');
    } finally {
      if (browser) await browser.close();

      // Step H: Success ဖြစ်ဖြစ် Fail ဖြစ်ဖြစ် ၅ စက္ကန့်အကြာတွင် မူရင်း Link Message နှင့် Bot Reply ကို Auto Delete လုပ်ခြင်း
      setTimeout(async () => {
        if (message.deletable) await message.delete().catch(() => {});
        if (replyMsg.deletable) await replyMsg.delete().catch(() => {});
      }, 5000);
    }
  }
});

// Error Management
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Error:', error);
});

// Discord Bot Login
client.login(process.env.DISCORD_TOKEN);