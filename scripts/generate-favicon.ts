// 同步图像生成的品牌 PNG，并用 Pillow 生成 32x32 favicon.ico 与 1200x630 og:image。
// 用法：node scripts/generate-favicon.ts
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalBrandDirectory = join(ROOT, "assets", "brand");
const faviconIcoScript = join(ROOT, "scripts", "generate-favicon-ico.py");
const ogImageScript = join(ROOT, "scripts", "generate-og-image.py");
const iconSource = join(canonicalBrandDirectory, "band-icon.png");
const lockupSource = join(canonicalBrandDirectory, "band-lockup.png");
const brandFiles = ["band-icon.png", "band-wordmark.png", "band-lockup.png"] as const;

for (const target of ["apps/app/public", "apps/landing/public"]) {
  const publicDirectory = join(ROOT, target);
  const brandDirectory = join(publicDirectory, "brand");
  const faviconPng = join(publicDirectory, "favicon.png");
  const faviconIco = join(publicDirectory, "favicon.ico");
  const ogImage = join(publicDirectory, "og-image.png");

  mkdirSync(brandDirectory, { recursive: true });
  for (const filename of brandFiles) {
    copyFileSync(join(canonicalBrandDirectory, filename), join(brandDirectory, filename));
  }
  execFileSync("python3", [faviconIcoScript, iconSource, faviconIco, faviconPng], {
    stdio: "inherit",
  });
  execFileSync("python3", [ogImageScript, lockupSource, ogImage], {
    stdio: "inherit",
  });
  console.log(`written: ${target}/brand/*.png, favicon.png, favicon.ico, og-image.png`);
}
