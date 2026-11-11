# มานะ — image สำหรับรันบน Server (Linux)
FROM node:24-bookworm-slim

# openssl: Prisma · tar/gzip: ระบบสำรองข้อมูล
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tar gzip \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# ค่าชั่วคราวตอน build (prisma generate ต้องมี) — ค่าจริงมาจาก .env ตอนรัน
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts/copy-ocr-assets.mjs ./scripts/
# เครื่องอ่านบัตร (pcsclite) ไม่ใช้บน Server — ถ้า build ไม่ได้ npm ข้ามให้เอง
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["sh", "deploy/entrypoint.sh"]
