import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check: ไม่มี cookie session → ไปหน้า login
 * (การตรวจจริงทำใน requireStaff() ของทุกหน้าและทุก server action)
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("vms_session")) return NextResponse.next();

  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // ไม่ผ่าน proxy: login, เงื่อนไข/นโยบาย, หน้า Host อนุมัติ E-Stamp, หน้าแจ้งแขกของลูกบ้าน (r/) และ QR ของแขก (g/), ไฟล์ static/OCR/โลโก้ /photos (ตรวจสิทธิ์เองใน route) และ LINE webhook (ตรวจลายเซ็น)
  matcher: ["/((?!login|terms|privacy|stamp/|r/|g/|photos/|api/line/|_next/static|_next/image|ocr/|brand/|icon.png|apple-icon.png|favicon.ico).*)"],
};
