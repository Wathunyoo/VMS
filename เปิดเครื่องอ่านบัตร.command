#!/bin/zsh
# ดับเบิลคลิกเพื่อเปิดโปรแกรมเชื่อมเครื่องอ่านบัตรประชาชน (เปิดค้างไว้ระหว่างใช้งานหน้า Check-in)
# ไม่มีเครื่องอ่านบัตร อยากลองระบบ: รัน  npm run card-agent -- --simulate
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"
npm run card-agent
echo ""
read "?กด Enter เพื่อปิดหน้าต่าง"
