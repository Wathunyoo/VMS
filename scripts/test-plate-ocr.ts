/**
 * ทดสอบอ่านป้ายทะเบียน
 *   npm run test:plate
 *  1) ตัวแยกข้อความ (ข้อความ OCR ตัวอย่างที่มีความผิดพลาดแบบที่พบบ่อย)
 *  2) อ่านจากภาพป้ายจำลองด้วย Tesseract ตัวเดียวกับในเบราว์เซอร์ (โมเดลภาษาในเครื่อง ไม่ใช้อินเทอร์เน็ต)
 */
import path from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM } from "tesseract.js";
import { matchProvince, parsePlateOcr, parsePlateText } from "@/domain/visit/plate-parser";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => boolean | Promise<boolean>) {
  try {
    const ok = await fn();
    ok ? passed++ : failed++;
    console.log(`${ok ? "  ✓" : "  ✗ FAIL"}  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ FAIL  ${name} — ${e instanceof Error ? e.message : e}`);
  }
}
const eq = (r: { plateNumber: string | null; province: string | null }, plate: string | null, province: string | null) => {
  const ok = r.plateNumber === plate && r.province === province;
  if (!ok) console.log("      got", r);
  return ok;
};

/** ภาพป้ายจำลอง 1280×720: ป้ายอยู่ในกรอบนำสายตาของกล้อง */
async function plateImage(top: string, bottom: string, font: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <rect width="1280" height="720" fill="#6b7280"/>
    <rect x="290" y="210" width="700" height="300" rx="18" fill="#fafafa" stroke="#111" stroke-width="10"/>
    <text x="640" y="350" font-family="${font}" font-size="120" font-weight="bold" text-anchor="middle" fill="#111">${top}</text>
    <text x="640" y="465" font-family="${font}" font-size="70" text-anchor="middle" fill="#111">${bottom}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/** เลียนแบบ recognizePlate() ในเบราว์เซอร์: ตัดกรอบนำสายตา (10%,22%,80%,56%) แล้วตัดเป็นแถบ */
async function strip(img: Buffer, x0: number, x1: number, y0: number, y1: number) {
  const [bx, by, bw, bh] = [128, 158.4, 1024, 403.2];
  const region = { left: Math.round(bx + bw * x0), top: Math.round(by + bh * y0), width: Math.round(bw * (x1 - x0)), height: Math.round(bh * (y1 - y0)) };
  return sharp(await sharp(img).extract(region).toBuffer()).resize({ width: 1800 }).grayscale().normalise().png().toBuffer();
}

const THAI_CONSONANTS = "กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ";
const THAI_MARKS = "ะัาำิีึืุูเแโใไ็่้๊๋์ฯๆ";

async function main() {
  console.log("\nแยกข้อความ OCR");
  await check("ป้ายรถยนต์ทั่วไป", () => eq(parsePlateText("1กข 1234\nกรุงเทพมหานคร"), "1กข 1234", "กรุงเทพมหานคร"));
  await check("ไม่มีเลขนำหน้าหมวด + ตัวเลขไทย", () => eq(parsePlateText("ฒล ๕๕๕๕\nเชียงใหม่"), "ฒล 5555", "เชียงใหม่"));
  await check("OCR สับสน O/0, I/1 และมีขีด", () => eq(parsePlateText("2ขค-1O2I\nชลบุรี"), "2ขค 1021", "ชลบุรี"));
  await check("รถบรรทุก 70-1234", () => eq(parsePlateText("70-1234\nระยอง"), "70-1234", "ระยอง"));
  await check("จังหวัดสะกดผิดเล็กน้อย / มีตัวอักษรเกิน", () => matchProvince("นครราชสืมา") === "นครราชสีมา" && matchProvince("| สมุทรปราการ .") === "สมุทรปราการ");
  await check("กทม. → กรุงเทพมหานคร", () => matchProvince("กรุงเทพฯ") === "กรุงเทพมหานคร");
  await check("ข้อความไม่ใช่ป้าย → ไม่เดา", () => eq(parsePlateText("ยินดีต้อนรับ\nwelcome"), null, null));
  await check("มีข้อความรบกวนบรรทัดบน", () => eq(parsePlateText("~~ ..\n3กก 789\nขอนแก่น"), "3กก 789", "ขอนแก่น"));

  await check("รวมผลหลายรอบ: ครึ่งขวาตัดเลข 9 ขาด (จจ 9595) → ใช้ค่าที่สองรอบตรงกัน", () =>
    eq(parsePlateOcr({ line: "จจ 9595 ป", digitsFull: "9595", digitsRight: "1595", province: "ป     กรงเทพมหานคร" }), "จจ 9595", "กรุงเทพมหานคร"));
  await check("รวมผลหลายรอบ: บรรทัดไทยอ่านเลขเพี้ยน (5กก วว5ว5) → ใช้ครึ่งขวา", () =>
    eq(parsePlateOcr({ line: "5กก วว5ว5", digitsFull: "505555", digitsRight: "5555", province: "ชลบุรี" }), "5กก 5555", "ชลบุรี"));

  console.log("\nอ่านจากภาพป้ายจำลอง (Tesseract ในเครื่อง)");
  const opts = { langPath: path.join(process.cwd(), "public", "ocr", "lang"), gzip: true, cachePath: path.join(process.cwd(), "node_modules", ".cache", "tesseract-test") };
  const thai = await createWorker(["tha"], OEM.LSTM_ONLY, opts);
  const digit = await createWorker(["eng"], OEM.LSTM_ONLY, opts);
  await thai.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  await digit.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "0123456789-" });
  const read = async (img: Buffer) => {
    await thai.setParameters({ tessedit_char_whitelist: `${THAI_CONSONANTS}0123456789- ` });
    const line = (await thai.recognize(await strip(img, 0, 1, 0.08, 0.62))).data.text.trim();
    await thai.setParameters({ tessedit_char_whitelist: THAI_CONSONANTS + THAI_MARKS });
    const province = (await thai.recognize(await strip(img, 0, 1, 0.55, 0.95))).data.text.trim();
    const digitsFull = (await digit.recognize(await strip(img, 0, 1, 0.08, 0.62))).data.text.trim();
    const digitsRight = (await digit.recognize(await strip(img, 0.5, 1, 0.08, 0.62))).data.text.trim();
    return parsePlateOcr({ line, digitsFull, digitsRight, province });
  };
  try {
    const cases: [string, string][] = [
      ["1กข 1234", "กรุงเทพมหานคร"],
      ["5กก 5555", "ชลบุรี"],
      ["70-4321", "ระยอง"],
      ["2ขค 99", "นครราชสีมา"],
      ["9กพ 7012", "เชียงใหม่"],
    ];
    let ok = 0;
    let total = 0;
    for (const font of ["Thonburi", "Tahoma"]) {
      for (const [top, bottom] of cases) {
        total++;
        const r = await read(await plateImage(top, bottom, font));
        const hit = r.plateNumber === top && r.province === bottom;
        if (hit) ok++;
        console.log(`  ${hit ? "·" : "×"} ${font.padEnd(8)} ${top} / ${bottom}  →  ${r.plateNumber ?? "—"} / ${r.province ?? "—"}`);
      }
    }
    // OCR เป็นตัวช่วยกรอก (เจ้าหน้าที่ตรวจทานทุกครั้ง) — ตั้งเกณฑ์ไว้กันคุณภาพถดถอย
    await check(`อ่านถูกทั้งทะเบียนและจังหวัด ≥ 70% (${ok}/${total})`, () => ok / total >= 0.7);
  } finally {
    await thai.terminate();
    await digit.terminate();
  }

  console.log(`\nผล: ผ่าน ${passed} / ${passed + failed}${failed ? `  —  ไม่ผ่าน ${failed}` : ""}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
