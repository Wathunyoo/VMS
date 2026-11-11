import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { requireStaff } from "@/infrastructure/auth/session";

export default async function ChangePasswordPage() {
  const user = await requireStaff({ allowMustChangePassword: true });

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 md:p-8">
      {user.mustChangePassword && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          คุณกำลังใช้รหัสผ่านชั่วคราว กรุณาตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>เปลี่ยนรหัสผ่าน</CardTitle>
          <p className="text-sm text-muted-foreground">
            {user.fullName} ({user.username})
          </p>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
