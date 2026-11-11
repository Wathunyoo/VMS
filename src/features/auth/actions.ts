"use server";

import { redirect } from "next/navigation";
import { AuthError, changeOwnPassword, login } from "@/application/auth/auth.usecase";
import { authDeps } from "@/container";
import { bindAssignedPoint } from "@/infrastructure/auth/station";
import { createSession, currentSessionId, destroySession, homePath, requireStaff } from "@/infrastructure/auth/session";

export interface FormState {
  error?: string;
}

/** อนุญาตเฉพาะ path ภายในระบบ (กัน open redirect) */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let mustChange = false;
  let onboarding = false;
  try {
    const user = await login(
      String(fd.get("org") ?? ""),
      String(fd.get("username") ?? ""),
      String(fd.get("password") ?? ""),
      authDeps,
    );
    await createSession(user.id);
    // เจ้าหน้าที่ประจำจุด: เครื่องที่เข้าระบบกลายเป็นจุด Check-in นั้นอัตโนมัติ
    await bindAssignedPoint(user);
    mustChange = user.mustChangePassword;
    onboarding = user.needsOnboarding && user.role === "ADMIN";
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error("[login]", e);
    return { error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่" };
  }
  redirect(mustChange ? "/account/password" : onboarding ? "/onboarding" : safeNext(fd.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff({ allowMustChangePassword: true });
  try {
    await changeOwnPassword(
      user,
      {
        current: String(fd.get("current") ?? ""),
        next: String(fd.get("next") ?? ""),
        confirm: String(fd.get("confirm") ?? ""),
      },
      (await currentSessionId())!,
      authDeps,
    );
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error("[change-password]", e);
    return { error: "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่" };
  }
  redirect(homePath(user));
}
