"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { adminTabsFor } from "./admin-tabs-data";

export function AdminTabs({ platformOrg = false }: { platformOrg?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="ตั้งค่า" className="no-print border-b bg-muted/40">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 md:px-8">
        {adminTabsFor(platformOrg).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname.startsWith(href) ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-background",
              pathname.startsWith(href) && "bg-background font-medium shadow-sm",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
