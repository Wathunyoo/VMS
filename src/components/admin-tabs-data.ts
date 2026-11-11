import { ClipboardList, DatabaseZap, ListTree, MessageCircle, MonitorSmartphone, Users } from "lucide-react";

// แยกจาก admin-tabs.tsx ("use client") — ค่าที่ไม่ใช่ component ใน client module ใช้จาก Server Component ไม่ได้
/** เมนูย่อยของ "ตั้งค่า" (เฉพาะผู้ดูแลระบบ) */
export const ADMIN_TABS = [
  { href: "/admin/directory", label: "รายชื่อ", desc: "สถานที่ บริษัท/บ้าน ผู้รับพบ/ลูกบ้าน จุดขนถ่าย", icon: ListTree },
  { href: "/admin/form", label: "แบบฟอร์ม", desc: "เปิด-ปิด/บังคับกรอก ช่องในหน้า Check-in และเพิ่มช่องเอง", icon: ClipboardList },
  { href: "/admin/users", label: "เจ้าหน้าที่", desc: "บัญชี รปภ. / ต้อนรับ และผู้ดูแลระบบ", icon: Users },
  { href: "/admin/devices", label: "จุด Check-in", desc: "ลงทะเบียนแท็บเล็ต/คอมพิวเตอร์ที่จุด รปภ.", icon: MonitorSmartphone },
  { href: "/admin/host-line", label: "LINE", desc: "เชื่อม LINE ให้ผู้รับพบ/ลูกบ้าน รับแจ้งเตือน", icon: MessageCircle },
  { href: "/admin/data-retention", label: "PDPA", desc: "ระยะเวลาเก็บข้อมูลส่วนบุคคล", icon: DatabaseZap },
] as const;

/** องค์กรผู้ให้บริการ (main) ไม่มีสถานที่ — ตั้งค่าได้เฉพาะบัญชีเจ้าหน้าที่ */
export const adminTabsFor = (platformOrg: boolean) => (platformOrg ? ADMIN_TABS.filter((t) => t.href === "/admin/users") : ADMIN_TABS);

