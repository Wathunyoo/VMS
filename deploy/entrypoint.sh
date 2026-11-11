#!/bin/sh
# อัปเดตฐานข้อมูลให้เป็นรุ่นล่าสุดก่อนเปิดระบบทุกครั้ง
set -e
npx prisma migrate deploy
exec npx next start -H 0.0.0.0 -p 3000
