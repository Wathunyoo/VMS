#!/bin/bash
# ส่งระบบมานะขึ้น Server แล้วเปิดใช้งาน — รันจาก Mac:  bash deploy/deploy.sh <IP ของ Server>
# รันซ้ำเพื่ออัปเดตโปรแกรมได้ (ข้อมูล .env storage backups บน Server ไม่ถูกแตะ)
set -euo pipefail
IP="${1:?ใส่ IP ของ Server เช่น bash deploy/deploy.sh 159.89.1.2}"
KEY="${MANA_SSH_KEY:-$HOME/.ssh/mana_do}"
cd "$(dirname "$0")/.."
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 "root@$IP")
COMPOSE="cd /opt/mana && docker compose --env-file .env -f deploy/docker-compose.yml"

echo "1/5 เตรียม Server"
"${SSH[@]}" 'bash -s' < deploy/server-bootstrap.sh

echo "2/5 ส่งโปรแกรมขึ้น Server"
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  --exclude /node_modules --exclude /.next --exclude /.env --exclude '/.env.*' --exclude /storage --exclude /backups \
  --exclude /.pgdata --exclude /src/generated --exclude /public/ocr --exclude /docs --exclude '/*.command' \
  --exclude '/*.zip' --exclude /.claude --exclude /.git --exclude .DS_Store \
  ./ "root@$IP:/opt/mana/"

echo "3/5 ตั้งค่า"
"${SSH[@]}" "SERVER_IP=$IP bash /opt/mana/deploy/make-server-env.sh"

echo "4/5 สร้างและเปิดระบบ (ครั้งแรกใช้เวลาประมาณ 5–10 นาที)"
"${SSH[@]}" "$COMPOSE up -d --build --remove-orphans"

echo "5/5 ตรวจระบบ"
SITE=$("${SSH[@]}" "grep ^SITE_ADDRESS= /opt/mana/.env | cut -d'\"' -f2")
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$SITE/login" || true)
  [ "$code" = "200" ] && break
  sleep 5
done
CREATED=$("${SSH[@]}" "$COMPOSE exec -T app npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/create-admin.ts" 2>&1 || true)
echo "$CREATED" | tail -1

# บัญชีผู้ดูแลเพิ่งสร้าง → เก็บรหัสผ่านเริ่มต้นไว้ในไฟล์บนเครื่องนี้ (อ่านได้เฉพาะเจ้าของเครื่อง) ไม่แสดงบนจอ
if echo "$CREATED" | grep -q "สร้างบัญชี"; then
  mkdir -p storage
  umask 077
  "${SSH[@]}" "grep -E '^(APP_URL|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_PASSWORD)=' /opt/mana/.env" > storage/server-admin.txt
  echo "รหัสผ่านเริ่มต้นของผู้ดูแลอยู่ใน storage/server-admin.txt (ต้องเปลี่ยนตอนเข้าครั้งแรก)"
fi
echo
echo "เสร็จแล้ว: https://$SITE  (สถานะหน้า login: ${code:-?})"
