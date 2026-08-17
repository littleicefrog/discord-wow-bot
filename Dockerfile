FROM node:18-slim

# Chromium Build အတွက် မဖြစ်မနေ လိုအပ်သော Lightweight Library နည်းနည်းသာ သွင်းပါမည်
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer Environment Variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["node", "index.js"]