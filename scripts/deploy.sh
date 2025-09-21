#!/bin/bash

# Скрипт деплоя для rvn.guru
# Использование: ./scripts/deploy.sh

set -e

echo "🚀 Начинаем деплой rvn.guru..."

# Переменные
PROJECT_DIR="/var/www/rvnprivate"
NGINX_CONFIG="/etc/nginx/sites-available/rvn.guru"
NGINX_ENABLED="/etc/nginx/sites-enabled/rvn.guru"
SERVICE_NAME="rvnprivate"

# Проверяем, что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo "❌ Ошибка: Запустите скрипт из корня проекта"
    exit 1
fi

echo "📦 Сборка проекта..."
npm run build

echo "🔄 Остановка сервиса..."
sudo systemctl stop $SERVICE_NAME || true

echo "📁 Копирование файлов..."
sudo mkdir -p $PROJECT_DIR
sudo cp -r .next $PROJECT_DIR/
sudo cp -r public $PROJECT_DIR/
sudo cp -r app $PROJECT_DIR/
sudo cp -r components $PROJECT_DIR/
sudo cp -r hooks $PROJECT_DIR/
sudo cp package.json $PROJECT_DIR/
sudo cp next.config.ts $PROJECT_DIR/
sudo cp tsconfig.json $PROJECT_DIR/
sudo cp tailwind.config.ts $PROJECT_DIR/
sudo cp postcss.config.mjs $PROJECT_DIR/

echo "📋 Установка зависимостей..."
cd $PROJECT_DIR
sudo npm ci --production

echo "🔧 Настройка NGINX..."
sudo cp temp/nginx-rvn.guru.conf $NGINX_CONFIG
sudo ln -sf $NGINX_CONFIG $NGINX_ENABLED

echo "🔍 Проверка конфигурации NGINX..."
sudo nginx -t

echo "🔄 Перезагрузка NGINX..."
sudo systemctl reload nginx

echo "🚀 Запуск сервиса..."
sudo systemctl start $SERVICE_NAME
sudo systemctl enable $SERVICE_NAME

echo "✅ Деплой завершен!"
echo "🌐 Сайт доступен по адресу: https://rvn.guru"
echo "📊 Статус сервиса: sudo systemctl status $SERVICE_NAME"
echo "📝 Логи: sudo journalctl -u $SERVICE_NAME -f"
