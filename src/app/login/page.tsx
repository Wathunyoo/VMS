import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentUser, homePath } from "@/infrastructure/auth/session";
import { APP_NAME, APP_TAGLINE, BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `เข้าสู่ระบบ — ${APP_NAME}` };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; org?: string }> }) {
  const [{ next, org }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect(user.mustChangePassword ? "/account/password" : homePath(user));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo} alt="" width={240} height={240} className="mx-auto -mb-2 size-60 mix-blend-multiply" />
          <h1 className="sr-only">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">{APP_TAGLINE} — สำหรับเจ้าหน้าที่</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <LoginForm next={next} org={org?.slice(0, 40)} />
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบเพื่อรีเซ็ต</p>
        <p className="text-center text-sm text-muted-foreground">ยังไม่มีบัญชีองค์กร? ติดต่อผู้ให้บริการเพื่อติดตั้งระบบ</p>
      </div>
    </main>
  );
}
