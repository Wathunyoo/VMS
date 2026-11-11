import { redirect } from "next/navigation";

// เมนูค่าบริการถูกยกเลิก — ลูกค้าใช้งานตามสัญญา (จำนวนจุดกำหนดโดยผู้ให้บริการที่หน้า "ลูกค้า")
export default function BillingPage() {
  redirect("/admin");
}
