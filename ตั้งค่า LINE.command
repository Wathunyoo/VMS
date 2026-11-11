#!/bin/zsh
# ดับเบิลคลิกเพื่อใส่ค่า LINE (Channel secret / access token) ลงในระบบ — ค่าลับไม่แสดงบนจอ
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"
node scripts/setup-line.mjs
