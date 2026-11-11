import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `นโยบายความเป็นส่วนตัว — ${APP_NAME}` };

/** ร่างโครง — ต้องให้ทนาย/DPO ตรวจและเขียนเนื้อหาจริงก่อนเปิดให้บริการ */
export default function Page() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 py-12">
      <h1 className="text-2xl font-bold">นโยบายความเป็นส่วนตัว</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        [ร่าง — รอฝ่ายกฎหมายตรวจและจัดทำเนื้อหาฉบับจริง]
      </p>
      <p className="text-muted-foreground">[ชื่อผู้ให้บริการ] · [ที่อยู่] · [ช่องทางติดต่อ / DPO] · ฉบับวันที่ [วันที่มีผล]</p>
    </main>
  );
}
