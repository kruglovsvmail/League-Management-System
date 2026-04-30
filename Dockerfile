# Используем легковесный образ Node.js
FROM node:20-slim

# Обновляем пакеты и устанавливаем Chromium, шрифты и все нужные библиотеки для Puppeteer
# Флаг Acquire::ForceIPv4=true добавлен для обхода зависаний сети
RUN apt-get update -o Acquire::ForceIPv4=true && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libglib2.0-0 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Заставляем Puppeteer использовать системный Chromium и отключаем его внутреннюю загрузку
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Создаем рабочую папку внутри контейнера
WORKDIR /app

# Копируем ТОЛЬКО бэкенд, так как фронтенд деплоится отдельным сервисом
COPY LMS-Backend/ ./LMS-Backend/

# Переходим в папку бэкенда и устанавливаем только серверные зависимости
WORKDIR /app/LMS-Backend
RUN npm install

# Открываем порт 3001
EXPOSE 3001

# ЗАПУСКАЕМ НАПРЯМУЮ ЧЕРЕЗ NODE, А НЕ ЧЕРЕЗ NPM
CMD ["node", "server.js"]