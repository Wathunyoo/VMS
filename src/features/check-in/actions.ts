"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { checkInSchema, formDataToCheckInPayload } from "@/application/check-in/check-in.schema";
import { CheckInError, CheckInValidationError, checkInVisitor } from "@/application/check-in/check-in.usecase";
import { precheckRawForm } from "@/application/check-in/form-rules";
import { checkInDeps, formSettingsDeps } from "@/container";
import { requireStaff } from "@/infrastructure/auth/session";
import { stationCheck } from "@/infrastructure/auth/station";

export interface CheckInState {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export async function checkInAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const staff = await requireStaff();
  const station = await stationCheck(staff, "CHECK_IN");
  if (!station.ok) return { error: station.message };
  const payload = formDataToCheckInPayload(formData);
  const parsed = checkInSchema.safeParse(payload);
  if (!parsed.success) {
    // รวมข้อผิดพลาดตามการตั้งค่าแบบฟอร์มด้วย ให้เห็นทุกช่องที่ต้องแก้ในครั้งเดียว
    const repo = formSettingsDeps(staff.organizationId).repo;
    const [config, customFields] = await Promise.all([repo.config(), repo.customFields(false)]);
    const fieldErrors: Record<string, string[] | undefined> = { ...precheckRawForm(payload, config, customFields) };
    for (const [k, v] of Object.entries(z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>)) fieldErrors[k] = v;
    return { error: "กรุณาตรวจสอบข้อมูลที่ไฮไลต์", fieldErrors };
  }

  let visitId: string;
  try {
    ({ visitId } = await checkInVisitor(parsed.data, checkInDeps(staff.organizationId), staff.username));
  } catch (e) {
    if (e instanceof CheckInValidationError) return { error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof CheckInError) return { error: e.message };
    console.error("[check-in]", e);
    return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
  }

  redirect(`/pass/${visitId}`);
}
