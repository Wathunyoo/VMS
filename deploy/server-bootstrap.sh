#!/bin/bash
# เตรียม Server (Ubuntu 24.04) ครั้งแรก — รันซ้ำได้ ไม่เสียหาย
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "• ติดตั้ง Docker (จากคลังโปรแกรมของ Ubuntu)"
  apt-get update -q
  apt-get install -y -q docker.io docker-compose-v2 rsync ufw
  systemctl enable --now docker
fi

# หน่วยความจำสำรอง 2 GB — กันเครื่องเล็ก (RAM 2 GB) ค้างตอน build
if ! swapon --show | grep -q /swapfile; then
  echo "• เพิ่ม swap 2 GB"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Firewall: เปิดเฉพาะ SSH และเว็บ
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

mkdir -p /opt/mana/storage /opt/mana/backups
echo "• Server พร้อม"
