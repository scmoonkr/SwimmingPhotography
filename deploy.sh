#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== [1/6] git pull ==="
cd "$PROJECT_DIR"
# 자동 배포 시 주석 해제 (워킹트리가 깨끗해야 함 — untracked/로컬수정 있으면 실패)
# git pull origin main

echo "=== [2/6] 패키지 설치 (workspaces: server + client + dashboard) ==="
cd "$PROJECT_DIR"
# 루트에서 한 번 → 세 워크스페이스 의존성 모두 설치 (Nuxt 빌드에 devDependencies 필요)
npm install

echo "=== [3/6] client(Nuxt) 빌드 ==="
npm run build --workspace=client

echo "=== [4/6] dashboard(Nuxt) 빌드 ==="
npm run build --workspace=dashboard

echo "=== [5/6] PM2 재시작 ==="
cd "$PROJECT_DIR"

# 레거시 프로세스명 정리 (photography-nuxt → photography-client 로 변경됨)
pm2 delete photography-nuxt 2>/dev/null || true

# Express API (port 6640)
if pm2 list | grep -q "photography-api"; then
  pm2 restart photography-api --update-env
else
  PORT=6640 pm2 start "$PROJECT_DIR/server/src/index.js" \
    --name photography-api \
    --cwd "$PROJECT_DIR/server"
fi

# 공개 사이트 Nuxt (port 6641)
if pm2 list | grep -q "photography-client"; then
  pm2 restart photography-client --update-env
else
  PORT=6641 pm2 start "$PROJECT_DIR/client/.output/server/index.mjs" \
    --name photography-client
fi

# 관리자 대시보드 Nuxt (port 6642)
if pm2 list | grep -q "photography-dashboard"; then
  pm2 restart photography-dashboard --update-env
else
  PORT=6642 pm2 start "$PROJECT_DIR/dashboard/.output/server/index.mjs" \
    --name photography-dashboard
fi

echo "=== [6/6] PM2 저장 ==="
pm2 save

echo ""
echo "배포 완료!"
echo "  - API       http://localhost:6640"
echo "  - 공개사이트  http://localhost:6641"
echo "  - 대시보드   http://localhost:6642"
pm2 list
