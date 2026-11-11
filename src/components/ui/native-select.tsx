import * as React from "react";
import { cn } from "@/lib/utils";

/** Native <select> สไตล์ shadcn — ส่งค่าผ่าน FormData ได้ตรง ๆ และใช้งานบน kiosk/แท็บเล็ตได้ดี */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
