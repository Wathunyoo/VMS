"use client";

import { QRCodeSVG } from "qrcode.react";
import { HIGH_RISK_LABEL, PPE_LABEL, stampStatusLabel } from "@/domain/visit/labels";
import { cn } from "@/lib/utils";
import type { PassViewModel } from "../pass-view-model";
import { APP_NAME, BRAND } from "@/lib/brand";

export type PaperWidth = 58 | 80;

/** พื้นที่พิมพ์จริง (หักขอบเครื่องพิมพ์ ~4mm/ข้าง) */
const PRINTABLE_MM: Record<PaperWidth, number> = { 58: 48, 80: 72 };

interface Props {
  pass: PassViewModel;
  paperWidth?: PaperWidth;
  className?: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0">{label}</span>
      <span className="text-right font-semibold break-all">{value}</span>
    </div>
  );
}

const Divider = () => <div className="my-[1.5mm] border-t border-dashed border-black" />;

/**
 * สลิปบัตรผ่านสำหรับ Thermal Printer 58/80mm
 * - ขาว-ดำล้วน ไม่มีเฉดเทา (thermal พิมพ์ gray ไม่ได้)
 * - ขนาดเป็น mm เพื่อให้ตรงกับกระดาษจริง
 * - พิมพ์ผ่าน window.print() + @page size (เลือก "Margins: None" ในไดรเวอร์)
 */
export function PrintablePass({ pass, paperWidth = 80, className }: Props) {
  const w = PRINTABLE_MM[paperWidth];
  const small = paperWidth === 58;
  const isFactory = pass.mode === "FACTORY";

  return (
    <>
      <style>{`@page { size: ${paperWidth}mm auto; margin: 0; }`}</style>
      <div
        className={cn("print-area bg-white text-black shadow-lg", className)}
        style={{
          width: `${paperWidth}mm`,
          padding: `3mm ${(paperWidth - w) / 2}mm 6mm`,
          fontSize: small ? "8pt" : "9pt",
          lineHeight: 1.35,
        }}
      >
        {/* Header */}
        <div className="text-center">
          <p className="font-bold" style={{ fontSize: small ? "10pt" : "12pt" }}>
            {pass.siteName}
          </p>
          <p className="tracking-widest">{isFactory ? "FACTORY VISITOR PASS" : pass.mode === "VILLAGE" ? "GUEST PASS" : "VISITOR PASS"}</p>
          <p
            className="my-[1.5mm] inline-block border-2 border-black px-[2mm] font-mono font-bold"
            style={{ fontSize: small ? "13pt" : "16pt" }}
          >
            {pass.passCode}
          </p>
          {pass.badgeNumber && <p>บัตรแลกเลขที่ {pass.badgeNumber}</p>}
        </div>

        <Divider />

        {/* Visitor */}
        <div className="flex gap-[2mm]">
          {pass.facePhotoUrl && !small && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pass.facePhotoUrl}
              alt=""
              className="shrink-0 object-cover grayscale contrast-125"
              style={{ width: "16mm", height: "20mm" }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold" style={{ fontSize: small ? "9pt" : "11pt" }}>
              {pass.visitorName}
            </p>
            {pass.company && <p>{pass.company}</p>}
            <p className="font-mono">
              {pass.idTypeLabel} {pass.idNumberMasked}
            </p>
          </div>
        </div>

        <Divider />

        <div className="space-y-[0.5mm]">
          <Row label="ติดต่อ" value={pass.visiting} />
          {pass.hostName && <Row label={pass.mode === "VILLAGE" ? "ลูกบ้าน" : "ผู้รับพบ"} value={pass.hostName} />}
          <Row label="วัตถุประสงค์" value={pass.purposeLabel} />
          <Row label="เวลาเข้า" value={pass.checkInText} />
          <Row label="ใช้ได้ถึง" value={pass.validUntilText} />
          {pass.vehicle && (
            <>
              <Row label="ทะเบียน" value={pass.vehicle.plate} />
              <Row label="ประเภทรถ" value={pass.vehicle.typeLabel} />
              {pass.vehicle.bay && <Row label="Loading Bay" value={pass.vehicle.bay} />}
            </>
          )}
          {pass.extras.map((x) => (
            <Row key={x.label} label={x.label} value={x.value} />
          ))}
        </div>

        {/* Mode-specific */}
        {isFactory ? (
          <>
            <Divider />
            <p className="font-bold">SAFETY {pass.inductionOk ? "✔ ผ่าน Induction" : "✘ ยังไม่ผ่าน Induction"}</p>
            <p>PPE: {pass.ppe.map((p) => PPE_LABEL[p]).join(", ") || "-"}</p>
            {pass.highRiskWorks.length > 0 && (
              <div className="mt-[1mm] border-2 border-black p-[1mm]">
                <p className="font-bold">⚠ งานเสี่ยง</p>
                {pass.highRiskWorks.map((r) => (
                  <p key={r}>• {HIGH_RISK_LABEL[r]}</p>
                ))}
                <p className="font-bold">Permit: {pass.workPermitId}</p>
              </div>
            )}
          </>
        ) : (
          pass.stampStatus !== "NOT_REQUIRED" && (
            <>
              <Divider />
              <Row
                label="E-Stamp"
                value={stampStatusLabel(pass.mode, pass.stampStatus)}
              />
            </>
          )
        )}

        <Divider />

        {/* QR */}
        <div className="flex flex-col items-center gap-[1mm]">
          <QRCodeSVG
            value={pass.qrToken}
            level="M"
            marginSize={0}
            style={{ width: small ? "32mm" : "40mm", height: small ? "32mm" : "40mm" }}
          />
          <p className="text-center">สแกน QR นี้ที่จุด รปภ. เมื่อออกจากพื้นที่</p>
        </div>

        <Divider />
        <p className="text-center" style={{ fontSize: small ? "6.5pt" : "7pt" }}>
          กรุณาติดบัตรให้เห็นชัดเจนตลอดเวลาและคืนบัตรเมื่อออก
          <br />
          ข้อมูลส่วนบุคคลได้รับการคุ้มครองตาม PDPA
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.wordmarkBw} alt={APP_NAME} className="mx-auto mt-[1.5mm]" style={{ height: small ? "4mm" : "5mm", width: "auto" }} />
      </div>
    </>
  );
}
