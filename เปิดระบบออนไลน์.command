#!/bin/zsh
# ดับเบิลคลิกเพื่อเปิดระบบแบบออนไลน์ (HTTPS ผ่าน Cloudflare Tunnel) — ปิดหน้าต่างเพื่อหยุด
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
node scripts/online.mjs
