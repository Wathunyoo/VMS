#!/bin/bash
# สร้าง /opt/mana/.env ครั้งแรก (ค่าลับสุ่มใหม่ทั้งหมด) — มีอยู่แล้วจะไม่แตะ
set -euo pipefail
cd /opt/mana
[ -f .env ] && { echo "• มี .env อยู่แล้ว — ใช้ค่าเดิม"; exit 0; }
: "${SERVER_IP:?}"
SITE="$(echo "$SERVER_IP" | tr . -).sslip.io"
hex() { openssl rand -hex "$1"; }
umask 077
cat > .env <<ENV
# มานะบน Server — สร้างอัตโนมัติ $(date -u +%F) (ห้ามแชร์ไฟล์นี้)
SITE_ADDRESS="$SITE"
APP_URL="https://$SITE"
NEXT_PUBLIC_APP_URL="https://$SITE"
DB_PASSWORD="$(hex 24)"
PASS_TOKEN_SECRET="$(hex 32)"
ID_HASH_SECRET="$(hex 32)"
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_PASSWORD="Mana$(hex 6)"
PLATFORM_ORG_SLUG="main"
BACKUP_KEEP="14"
# LINE — เว้นว่าง = ไม่ส่ง LINE (ข้อความไปอยู่ใน log แทน)
LINE_CHANNEL_ACCESS_TOKEN=""
LINE_CHANNEL_SECRET=""
LINE_OA_BASIC_ID=""
SMTP_URL=""
ENV
echo "• สร้าง .env แล้ว ($SITE)"
