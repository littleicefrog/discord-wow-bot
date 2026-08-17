const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');

// 1. Discord Bot Client Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 2. Bot Online Event
client.once('clientReady', () => {
  console.log('========================================');
  console.log(`✅ Success! Bot Online ဖြစ်သွားပါပြီ: ${client.user.tag}`);
  console.log('========================================');
});

// 3. Message Listener
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Discord Channel ထဲသို့ Raidbots Droptimizer Link ရောက်လာပါက စစ်ဆေးခြင်း
  if (message.content.includes('raidbots.com/simbot/report/')) {
    const raidbotsUrl = message.content.trim();
    const replyMsg = await message.reply('⏳ Processing...');

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new", // Cloud Hosting/Render ပေါ်တွင် Run ရန်အတွက် True သို့မဟုတ် "new" ပြောင်းပေးထားပါသည်
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Step A: Wishlist Page သို့ သွားခြင်း
      const wishlistUrl = 'https://wowutils.com/viserio-cooldowns/groups/6a809e90d1367bdf94b86464?tab=loot';
      await page.goto(wishlistUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Step B: Session Cookie ထည့်သွင်းခြင်း (Render Env Variable မှ ဖတ်ယူပါမည်)
      await page.setCookie({
        name: '__Secure-next-auth.session-token',
        value: process.env.SESSION_COOKIE, // 👈 ဒီနေရာတွင် process.env သုံးထားပါသည်
        path: '/',
        secure: true,
        httpOnly: true
      });

      // Cookie အကျိုးသက်ရောက်ရန် Reload ပြုလုပ်ခြင်း
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });

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
      const importDroptimizerBtnSelector = 'button::-p-text(Import droptimizer)'; 
      await page.waitForSelector(importDroptimizerBtnSelector, { timeout: 15000 });
      await page.click(importDroptimizerBtnSelector);

      // Step E: Modal ပွင့်လာပြီး Link ထည့်ခြင်း
      const linkInputSelector = 'input'; 
      await page.waitForSelector(linkInputSelector, { timeout: 10000 });
      await page.type(linkInputSelector, raidbotsUrl);

      // Step F: Fetch / Import ခလုတ်ကို နှိပ်ခြင်း
      const submitBtnSelector = 'button::-p-text(Fetch Report)'; 
      await page.waitForSelector(submitBtnSelector, { timeout: 5000 });
      await page.click(submitBtnSelector);

      // Step G: Process ပြီးဆုံးသည်အထိ ၅ စက္ကန့် စောင့်ခြင်း
      await new Promise(r => setTimeout(r, 5000));

      await replyMsg.edit('✅ Completed!');

    } catch (error) {
      console.error('Automation Error Details:', error);
      await replyMsg.edit('❌ Failed to process the Raidbots link.');
    } finally {
      if (browser) await browser.close();
    }
  }
});

// Error Management
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Error:', error);
});

// Discord Bot Login (Render Env Variable မှ ဖတ်ယူပါမည်)
client.login(process.env.DISCORD_TOKEN); // 👈 ဒီနေရာတွင် process.env သုံးထားပါသည်