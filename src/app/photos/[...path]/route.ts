import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { prisma } from "@/infrastructure/db/prisma";
import { db } from "@/infrastructure/db/tenant";
import { parsePhotoPath, readPhoto, type PhotoFolder } from "@/infrastructure/storage/local-photo-storage";

/**
 * เสิร์ฟรูปผู้ติดต่อ/ป้ายทะเบียนแบบตรวจสิทธิ์
 *  - เจ้าหน้าที่ที่ login แล้ว: เห็นได้เฉพาะรูปขององค์กรตัวเอง
 *  - Host ที่ถือลิงก์ E-Stamp (?st=token) ที่ยังไม่หมดอายุ: เห็นได้เฉพาะรูปใบหน้าของผู้ติดต่อรายนั้น
 *  - ภาพบัตร: เฉพาะเจ้าหน้าที่ขององค์กร (ไม่เปิดให้ Host)
 *  - ภาพป้ายทะเบียน: เฉพาะผู้ดูแลระบบขององค์กร (ดูได้จากหน้ารายงาน)
 */
export async function GET(request: NextRequest) {
  const urlPath = request.nextUrl.pathname;
  const photo = parsePhotoPath(urlPath);
  if (!photo) return notFound();

  if (!(await isAllowed(urlPath, photo.folder, request.nextUrl.searchParams.get("st")))) {
    // 404 แทน 403 — ไม่บอกว่ารูปมีอยู่จริง
    return notFound();
  }

  const data = await readPhoto(photo.file);
  if (!data) return notFound();

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

async function isAllowed(urlPath: string, folder: PhotoFolder, stampToken: string | null): Promise<boolean> {
  const user = await getCurrentUser();
  if (user && !user.mustChangePassword && (folder !== "plates" || user.role === "ADMIN")) {
    // ต้องเป็นรูปที่ถูกอ้างอิงโดยข้อมูลขององค์กรผู้ใช้ (ไฟล์ไม่ได้แยกโฟลเดอร์ตามองค์กร)
    const scoped = db(user.organizationId);
    const owned =
      folder === "faces"
        ? await scoped.visit.count({ where: { facePhotoUrl: urlPath } })
        : folder === "idcards"
          ? await scoped.visit.count({ where: { idCardPhotoUrl: urlPath } })
          : await scoped.vehicleInfo.count({ where: { platePhotoUrl: urlPath } });
    if (owned > 0) return true;
  }

  if (!stampToken || folder !== "faces" || !/^[A-Za-z0-9_-]{16,64}$/.test(stampToken)) return false;
  const visit = await prisma.visit.findUnique({
    where: { stampToken },
    select: { facePhotoUrl: true, stampOtpExpiresAt: true },
  });
  return !!visit && visit.facePhotoUrl === urlPath && !!visit.stampOtpExpiresAt && visit.stampOtpExpiresAt > new Date();
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
