import sharp from "sharp";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");
const svg = readFileSync(resolve(publicDir, "logo-light.svg"));

// Favicon — 32px, no extra padding needed
await sharp(svg).resize(32, 32).png().toFile(resolve(publicDir, "favicon.png"));

// PWA icons — add padding for maskable safe zone (80% inner)
// Logo occupies center 80% of canvas, 10% padding on each side
for (const size of [192, 512]) {
  const padding = Math.round(size * 0.1);
  const innerSize = size - padding * 2;
  const inner = await sharp(svg).resize(innerSize, innerSize).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: inner, left: padding, top: padding }])
    .png()
    .toFile(resolve(publicDir, `icon-${size}.png`));
}

console.log("Generated: favicon.png, icon-192.png, icon-512.png");
