#!/bin/zsh
# ดับเบิลคลิกไฟล์นี้เพื่อเปิดระบบ VMS — ปิดหน้าต่าง Terminal เพื่อหยุดระบบ
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"

npm run db:local &
DB_PID=$!
trap 'kill $DB_PID 2>/dev/null' EXIT INT TERM

sleep 5
(sleep 8; open "http://localhost:3000/check-in") &
npm run dev
