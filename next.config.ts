import type { NextConfig } from "next";

// โดเมนสาธารณะ (Cloudflare Tunnel) — อนุญาตให้ Server Actions รับ request จาก origin นี้
const publicHost = (() => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).host : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // รูปใบหน้า + ป้ายทะเบียน (JPEG base64) ส่งผ่าน Server Action
    serverActions: { bodySizeLimit: "8mb", ...(publicHost ? { allowedOrigins: [publicHost] } : {}) },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // กล้องใช้ได้เฉพาะหน้าเว็บของระบบเอง
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
