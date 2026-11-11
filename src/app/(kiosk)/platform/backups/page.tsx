import { AlertTriangle, CheckCircle2, HardDrive, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupNowButton } from "@/features/backups/components/backup-now-button";
import { requirePlatformAdmin } from "@/infrastructure/auth/station";
import { backupConfig, backupList, readBackupStatus } from "@/infrastructure/backup/backup-service";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;

export default async function BackupsPage() {
  await requirePlatformAdmin();
  const c = backupConfig();
  const [status, { local, copies }] = await Promise.all([readBackupStatus(), backupList()]);
  const ageH = status.lastSuccessAt ? (Date.now() - new Date(status.lastSuccessAt).getTime()) / 3600_000 : null;
  const healthy = ageH !== null && ageH < 48 && !(status.lastErrorAt && (!status.lastSuccessAt || status.lastErrorAt > status.lastSuccessAt));
  const rows = status.lastTables ? Object.entries(status.lastTables).filter(([t]) => !t.startsWith("_")).reduce((a, [, n]) => a + n, 0) : null;

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">สำรองข้อมูล</h1>
        <p className="text-sm text-muted-foreground">ทั้งระบบ (ทุกองค์กร) — ฐานข้อมูล รูปถ่าย สลิป และค่าตั้งระบบ · สำรองอัตโนมัติวันละครั้งขณะเปิดโปรแกรม</p>
      </header>

      <Card className={healthy ? "border-green-600/40" : "border-destructive/50"}>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
          <div className="space-y-1">
            <p className={`flex items-center gap-2 text-lg font-semibold ${healthy ? "text-green-700" : "text-destructive"}`}>
              {healthy ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
              {status.lastSuccessAt ? `สำรองล่าสุด ${fmt.format(new Date(status.lastSuccessAt))}` : "ยังไม่เคยสำรองข้อมูล"}
            </p>
            {status.lastSize != null && (
              <p className="text-sm text-muted-foreground">
                {mb(status.lastSize)} · {rows?.toLocaleString()} แถว{status.lastCopy ? " · มีสำเนาเข้ารหัสนอกเครื่อง" : ""}
              </p>
            )}
            {status.lastError && status.lastErrorAt && (!status.lastSuccessAt || status.lastErrorAt > status.lastSuccessAt) && (
              <p className="text-sm text-destructive">
                ล้มเหลวล่าสุด {fmt.format(new Date(status.lastErrorAt))}: {status.lastError}
              </p>
            )}
            {!c.enabled && <p className="text-sm text-amber-700">ปิดการสำรองอัตโนมัติอยู่ (BACKUP_SCHEDULER=off)</p>}
          </div>
          <BackupNowButton />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <HardDrive className="size-5" /> ในเครื่องนี้
            </CardTitle>
            <CardDescription className="break-all font-mono text-xs">{c.backupDir}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">เก็บ {c.keep} ไฟล์ล่าสุด · ไฟล์เปิดได้เฉพาะผู้ใช้เครื่องนี้</CardContent>
        </Card>
        <Card className={c.copyDir ? "" : "border-amber-400"}>
          <CardHeader>
            <CardTitle>
              <ShieldCheck className="size-5" /> สำเนานอกเครื่อง (เข้ารหัส)
            </CardTitle>
            <CardDescription className="break-all font-mono text-xs">{c.copyDir ?? "ยังไม่ได้ตั้ง BACKUP_COPY_DIR"}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {c.copyDir
              ? `${copies.length} ไฟล์ · ต้องใช้ BACKUP_KEY เพื่อเปิด — เก็บกุญแจไว้ที่อื่นนอกเครื่องนี้ด้วย`
              : "เครื่องเสีย/หาย ไฟล์สำรองในเครื่องจะหายไปด้วย — ตั้งโฟลเดอร์บนไดรฟ์ภายนอกหรือคลาวด์"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ไฟล์สำรอง ({local.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {local.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีไฟล์สำรอง</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {local.map((b) => (
                <li key={b.name} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="font-mono text-xs">{b.name}</span>
                  <span className="text-muted-foreground">
                    {fmt.format(b.createdAt)} · {mb(b.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            กู้คืน: ปิดโปรแกรม → เปิดเฉพาะฐานข้อมูล (<code>npm run db:local</code>) → <code>npm run backup:restore -- latest</code> — ระบบสำรองข้อมูลปัจจุบันไว้ให้ก่อนเสมอ
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
