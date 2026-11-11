"use client";

import { useRef, useState } from "react";
import { Car, Loader2, ScanText, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { VEHICLE_TYPE_LABEL } from "@/domain/visit/labels";
import type { FieldState } from "@/domain/form/form-config";
import { VEHICLE_TYPES, type SiteMode } from "@/domain/visit/types";
import { parsePlateOcr, THAI_PROVINCES } from "@/domain/visit/plate-parser";
import { recognizePlate } from "@/features/id-scan/ocr-engine";
import type { CheckInDirectory } from "@/infrastructure/repositories/prisma-directory.repository";
import { CameraCapture } from "./camera-capture";
import { Field } from "./field";

interface Props {
  mode: SiteMode;
  loadingBays: CheckInDirectory[number]["loadingBays"];
  errors: Record<string, string | undefined>;
  /** การตั้งค่าแบบฟอร์ม: ข้อมูลรถ / ภาพป้ายทะเบียน */
  vehicleState?: FieldState;
  platePhotoState?: FieldState;
  /** ทะเบียนรถที่ลูกบ้านแจ้งไว้ล่วงหน้า (อาจมีจังหวัดต่อท้าย) */
  initialPlate?: string | null;
}

/** "1กข 1234 กรุงเทพมหานคร" → แยกจังหวัดออกจากเลขทะเบียน */
function splitPlate(s: string): [string, string] {
  const province = THAI_PROVINCES.find((p) => s.endsWith(p));
  return province ? [s.slice(0, -province.length).trim(), province] : [s, ""];
}

export function VehicleSection({ mode, loadingBays, errors, vehicleState = "OPTIONAL", platePhotoState = "OPTIONAL", initialPlate }: Props) {
  const forced = vehicleState === "REQUIRED";
  const [initPlate, initProvince] = initialPlate ? splitPlate(initialPlate) : ["", ""];
  // หมู่บ้าน: ผู้มาหาส่วนใหญ่ขับรถเข้า — เปิดไว้ก่อน
  const [hasVehicle, setHasVehicle] = useState(forced || mode === "VILLAGE" || !!initialPlate);
  const [plate, setPlate] = useState(initPlate);
  const [province, setProvince] = useState(initProvince);
  const [ocr, setOcr] = useState<{ state: "reading" | "done" | "fail"; text?: string } | null>(null);
  const ocrRun = useRef(0);

  /** อ่านป้ายทะเบียนจากภาพในเครื่องนี้ แล้วกรอกให้ — เจ้าหน้าที่ตรวจทานก่อนบันทึก */
  const readPlate = async (dataUrl: string, guided: boolean) => {
    const run = ++ocrRun.current;
    setOcr({ state: "reading" });
    try {
      const r = parsePlateOcr(await recognizePlate(dataUrl, guided));
      if (run !== ocrRun.current) return; // ถ่ายใหม่ระหว่างอ่าน
      if (r.plateNumber) setPlate(r.plateNumber);
      if (r.province) setProvince(r.province);
      setOcr(
        r.plateNumber || r.province
          ? { state: "done", text: [r.plateNumber, r.province].filter(Boolean).join(" ") }
          : { state: "fail" },
      );
    } catch (e) {
      console.error("[plate-ocr]", e);
      if (run === ocrRun.current) setOcr({ state: "fail" });
    }
  };
  const isFactory = mode === "FACTORY";
  const Icon = isFactory ? Truck : Car;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>
          <Icon className="size-5" /> {isFactory ? "ยานพาหนะ & สินค้า" : "ยานพาหนะ"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="hasVehicle" className="text-sm text-muted-foreground">
            มีรถเข้าพื้นที่
          </Label>
          {forced ? <input type="hidden" name="hasVehicle" value="on" /> : null}
          <Switch id="hasVehicle" name={forced ? undefined : "hasVehicle"} checked={forced || hasVehicle} disabled={forced} onCheckedChange={setHasVehicle} />
        </div>
      </CardHeader>

      {errors.hasVehicle && !hasVehicle && <p className="px-5 pb-3 text-xs text-destructive">{errors.hasVehicle}</p>}

      {(forced || hasVehicle) && (
        <CardContent className="grid gap-4 md:grid-cols-[1fr_260px]">
          <div className="grid content-start gap-3 sm:grid-cols-2">
            <Field id="plateNumber" label="ทะเบียนรถ" required error={errors.plateNumber}>
              <Input
                id="plateNumber"
                name="plateNumber"
                placeholder="1กข 1234"
                className="uppercase"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                aria-invalid={!!errors.plateNumber}
              />
            </Field>
            <Field id="plateProvince" label="จังหวัด">
              <Input id="plateProvince" name="plateProvince" placeholder="กรุงเทพมหานคร" list="th-provinces" value={province} onChange={(e) => setProvince(e.target.value)} />
              <datalist id="th-provinces">
                {THAI_PROVINCES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field id="vehicleType" label="ประเภทรถ" required error={errors.vehicleType}>
              <NativeSelect id="vehicleType" name="vehicleType" defaultValue={isFactory ? "TRUCK_6W" : "CAR"}>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VEHICLE_TYPE_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="driverName" label="ชื่อคนขับ (ถ้าไม่ใช่ผู้ติดต่อ)">
              <Input id="driverName" name="driverName" />
            </Field>

            {isFactory && (
              <>
                <Field id="loadingBayId" label="จุดขนถ่ายสินค้า (Loading Bay)">
                  <NativeSelect id="loadingBayId" name="loadingBayId" defaultValue="">
                    <option value="">— ไม่ระบุ —</option>
                    {loadingBays.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} · {b.name}
                        {b.zone && ` (${b.zone})`}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="weightInKg" label="น้ำหนักชั่งเข้า (กก.)" hint="กรอกเมื่อผ่านตาชั่ง">
                  <Input id="weightInKg" name="weightInKg" type="number" inputMode="decimal" min={0} step="0.01" />
                </Field>
                <Field id="cargoDescription" label="รายละเอียดสินค้า / เลขที่ใบส่งของ" className="sm:col-span-2">
                  <Input id="cargoDescription" name="cargoDescription" placeholder="เช่น วัตถุดิบ PP 20 พาเลท · DO-889120" />
                </Field>
                <Field id="sealNumber" label="หมายเลขซีล (Seal No.)">
                  <Input id="sealNumber" name="sealNumber" />
                </Field>
              </>
            )}
          </div>

          {platePhotoState !== "HIDDEN" && (
            <div className="space-y-2">
              <CameraCapture
                name="platePhoto"
                label={`ภาพป้ายทะเบียน${platePhotoState === "REQUIRED" ? " *" : ""}`}
                facingMode="environment"
                aspect="landscape"
                maxWidth={1280}
                error={errors.platePhoto}
                onCapture={readPlate}
              />
              {ocr && (
                <p role="status" className={`flex items-center gap-1.5 text-xs ${ocr.state === "fail" ? "text-amber-700" : "text-muted-foreground"}`}>
                  {ocr.state === "reading" ? <Loader2 className="size-3.5 animate-spin" /> : <ScanText className="size-3.5" />}
                  {ocr.state === "reading"
                    ? "กำลังอ่านป้ายทะเบียน…"
                    : ocr.state === "done"
                      ? `กรอกให้จากภาพ: ${ocr.text} — ตรวจสอบก่อนบันทึก`
                      : "อ่านป้ายไม่ได้ — กรุณากรอกเอง หรือถ่ายใหม่ให้ป้ายอยู่ในกรอบและไม่สะท้อนแสง"}
                </p>
              )}
              {!ocr && <p className="text-xs text-muted-foreground">ถ่ายให้ป้ายอยู่ในกรอบ ระบบจะอ่านทะเบียนและจังหวัดให้อัตโนมัติ (ประมวลผลในเครื่องนี้)</p>}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
