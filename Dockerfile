FROM node:18-slim

# Chromium နှင့် လိုအပ်သော Packages များ တင်ခြင်း
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Chromium Path သတ်မှတ်ခြင်း
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./

# npm ci အစား npm install ဟု ပြောင်းထားပါသည်
RUN npm install --only=production

COPY . .

CMD ["node", "index.js"]