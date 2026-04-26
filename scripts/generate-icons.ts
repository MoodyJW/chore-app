import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

function generateIcon(size: number) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#7c6af7";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // Checkmark
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(size * 0.25, size * 0.5);
  ctx.lineTo(size * 0.45, size * 0.7);
  ctx.lineTo(size * 0.75, size * 0.3);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

function main() {
  const publicDir = path.join(process.cwd(), "public");
  const iconsDir = path.join(publicDir, "icons");

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // Generate PWA icons
  SIZES.forEach((size) => {
    const buffer = generateIcon(size);
    fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), buffer);
    console.log(`Generated icon-${size}x${size}.png`);
  });

  // Generate apple touch icon
  const appleBuffer = generateIcon(180);
  fs.writeFileSync(path.join(iconsDir, "apple-touch-icon.png"), appleBuffer);
  console.log("Generated apple-touch-icon.png");

  // Generate favicon
  const faviconBuffer = generateIcon(32);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), faviconBuffer);
  console.log("Generated favicon.ico");
}

main();
