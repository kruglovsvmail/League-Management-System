# Используем легковесный образ Node.js
FROM node:20-slim

# Обновляем пакеты и устанавливаем Chromium, шрифты и все нужные библиотеки
RUN apt-get update && apt-get install -y \
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

# Создаем рабочую папку внутри контейнера
WORKDIR /app

# Копируем абсолютно все файлы вашего проекта внутрь
COPY . .

# Устанавливаем зависимости сервера и клиента
# Используем --include=dev если для сборки фронтенда нужны devDependencies
RUN npm run build-server
RUN npm run build-client

# Открываем порт 3001
EXPOSE 3001

# ЗАПУСКАЕМ НАПРЯМУЮ ЧЕРЕЗ NODE, А НЕ ЧЕРЕЗ NPM
# Это уберет ошибки SIGTERM из логов
CMD ["node", "LMS-Backend/server.js"]