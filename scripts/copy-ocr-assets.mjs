// คัดลอกไฟล์ OCR (Tesseract) มาไว้ใน public/ocr — ให้ทำงานในเครื่องโดยไม่โหลดจาก CDN ภายนอก
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const out = path.resolve("public/ocr");

mkdirSync(path.join(out, "core"), { recursive: true });
mkdirSync(path.join(out, "lang"), { recursive: true });

cpSync(path.join(pkgDir("tesseract.js"), "dist/worker.min.js"), path.join(out, "worker.min.js"));

const core = pkgDir("tesseract.js-core");
for (const f of readdirSync(core)) {
  if (/^tesseract-core.*\.(wasm\.js|wasm|js)$/.test(f)) cpSync(path.join(core, f), path.join(out, "core", f));
}

for (const lang of ["tha", "eng"]) {
  const src = path.join(pkgDir(`@tesseract.js-data/${lang}`), "4.0.0_best_int", `${lang}.traineddata.gz`);
  cpSync(src, path.join(out, "lang", `${lang}.traineddata.gz`));
}
console.log("OCR assets copied to public/ocr");
