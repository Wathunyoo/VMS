import Link from "next/link";
import { MonitorX } from "lucide-react";
import type { CurrentStaff } from "@/application/auth/auth.types";
import { stationCheck } from "@/infrastructure/auth/station";

/** เตือนบนหน้า Check-in / Check-out เมื่อเครื่องนี้ทำรายการไม่ได้ */
export async function StationNotice({ staff, purpose }: { staff: CurrentStaff; purpose: "CHECK_IN" | "CHECK_OUT" }) {
  const st = await stationCheck(staff, purpose);
  if (st.ok) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-destructive/50 bg-destructive/5 p-4 text-sm">
      <MonitorX className="size-6 shrink-0 text-destructive" />
      <p className="flex-1 font-medium text-destructive">{st.message}</p>
      {staff.role === "ADMIN" &&
        (st.reason === "BILLING" ? (
          <span className="text-sm font-medium">ติดต่อผู้ให้บริการเพื่อต่อสัญญา</span>
        ) : (
          <Link href="/admin/devices" className="rounded-md bg-primary px-3 py-2 text-primary-foreground">
            จัดการจุด Check-in
          </Link>
        ))}
    </div>
  );
}
