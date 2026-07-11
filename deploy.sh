#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== [1/5] git pull ==="
cd "$PROJECT_DIR"
# git pull origin main

echo "=== [2/5] Express 패키지 설치 ==="
cd "$PROJECT_DIR/server"
npm install --omit=dev

echo "=== [3/5] Nuxt 패키지 설치 & 빌드 ==="
cd "$PROJECT_DIR/client"
npm install
npm run build

echo "=== [4/5] PM2 재시작 ==="
cd "$PROJECT_DIR"

# Express API (port 6640)
if pm2 list | grep -q "photography-api"; then
  pm2 restart photography-api
else
  pm2 start "$PROJECT_DIR/server/src/index.js" \
    --name photography-api \
    --cwd "$PROJECT_DIR/server"
fi

# Nuxt (port 6641)
if pm2 list | grep -q "photography-nuxt"; then
  pm2 restart photography-nuxt
else
  PORT=6641 pm2 start "$PROJECT_DIR/client/.output/server/index.mjs" \
    --name photography-nuxt \
    --env production
fi

echo "=== [5/5] PM2 저장 ==="
pm2 save

echo ""
echo "배포 완료!"
pm2 list
