/**
 * Generates label-free mega floor plans for public/maps/
 * Run: node scripts/generate-mega-floor-svgs.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 3960;
const H = 5603;
const outDir = join(__dirname, "..", "public", "maps");
mkdirSync(outDir, { recursive: true });

function wallLine(x1, y1, x2, y2, sw = 5) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3d4854" stroke-width="${sw}" stroke-linecap="square"/>`;
}

function thinWall(x1, y1, x2, y2) {
  return wallLine(x1, y1, x2, y2, 3);
}

/** Ground: spine + wing grid, no text */
function buildGround() {
  const lines = [];
  const m = 48;
  lines.push(`<rect width="${W}" height="${H}" fill="#c5cad1"/>`);
  lines.push(`<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="#d8dce2" stroke="#2d3748" stroke-width="16"/>`);

  const ix0 = m + 80;
  const iy0 = m + 80;
  const iw = W - 2 * m - 160;
  const ih = H - 2 * m - 160;
  const cx = ix0 + iw / 2;
  const cy = iy0 + ih / 2;

  const nx = 14;
  const ny = 18;
  const cw = iw / nx;
  const ch = ih / ny;

  for (let j = 0; j <= ny; j++) {
    const y = iy0 + j * ch;
    lines.push(thinWall(ix0, y, ix0 + iw, y));
  }
  for (let i = 0; i <= nx; i++) {
    const x = ix0 + i * cw;
    lines.push(thinWall(x, iy0, x, iy0 + ih));
  }

  const spineW = cw * 2.2;
  lines.push(`<rect x="${cx - spineW / 2}" y="${iy0}" width="${spineW}" height="${ih}" fill="none" stroke="#2d3748" stroke-width="10"/>`);
  lines.push(wallLine(ix0, cy, ix0 + iw, cy, 8));

  for (let k = 1; k < nx; k += 2) {
    const gx = ix0 + k * cw;
    const gap = ch * 2.5;
    lines.push(wallLine(gx, iy0 + ih * 0.15, gx, cy - gap / 2, 6));
    lines.push(wallLine(gx, cy + gap / 2, gx, iy0 + ih * 0.85, 6));
  }

  lines.push(`<rect x="${ix0 + cw * 2}" y="${iy0 + ch * 2}" width="${cw * 3}" height="${ch * 4}" fill="#b8bec8" stroke="#2d3748" stroke-width="6"/>`);
  lines.push(`<rect x="${ix0 + iw - cw * 5}" y="${iy0 + ch * 3}" width="${cw * 3}" height="${ch * 5}" fill="#b8bec8" stroke="#2d3748" stroke-width="6"/>`);
  lines.push(`<rect x="${ix0 + cw * 4}" y="${iy0 + ih - ch * 6}" width="${cw * 6}" height="${ch * 4}" fill="#aeb6c2" stroke="#2d3748" stroke-width="6"/>`);

  return lines.join("\n");
}

/** First floor: different bay rhythm + central void */
function buildFirst() {
  const lines = [];
  const m = 48;
  lines.push(`<rect width="${W}" height="${H}" fill="#c0c5ce"/>`);
  lines.push(`<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="#d4d8df" stroke="#2d3748" stroke-width="16"/>`);

  const ix0 = m + 100;
  const iy0 = m + 100;
  const iw = W - 2 * m - 200;
  const ih = H - 2 * m - 200;
  const cx = ix0 + iw / 2;
  const cy = iy0 + ih / 2;

  const voidW = iw * 0.28;
  const voidH = ih * 0.22;
  lines.push(`<rect x="${cx - voidW / 2}" y="${cy - voidH / 2}" width="${voidW}" height="${voidH}" fill="#e8eaef" stroke="#2d3748" stroke-width="8" stroke-dasharray="24 14"/>`);

  const nx = 11;
  const ny = 16;
  const cw = iw / nx;
  const ch = ih / ny;

  for (let j = 0; j <= ny; j++) {
    if (Math.abs(iy0 + j * ch - cy) < voidH / 2 + ch) continue;
    lines.push(thinWall(ix0, iy0 + j * ch, ix0 + iw, iy0 + j * ch));
  }
  for (let i = 0; i <= nx; i++) {
    const x = ix0 + i * cw;
    if (x > cx - voidW / 2 - 20 && x < cx + voidW / 2 + 20) continue;
    lines.push(thinWall(x, iy0, x, iy0 + ih));
  }

  for (let j = 2; j < ny - 2; j += 3) {
    const y = iy0 + j * ch;
    lines.push(wallLine(ix0 + cw * 0.5, y, cx - voidW / 2 - 40, y, 5));
    lines.push(wallLine(cx + voidW / 2 + 40, y, ix0 + iw - cw * 0.5, y, 5));
  }

  lines.push(wallLine(ix0, cy, ix0 + iw, cy, 7));
  lines.push(`<rect x="${ix0 + cw}" y="${iy0 + ch}" width="${cw * 2.2}" height="${ch * 3}" fill="#b0b8c4" stroke="#2d3748" stroke-width="5"/>`);
  lines.push(`<rect x="${ix0 + iw - cw * 3.5}" y="${iy0 + ch * 8}" width="${cw * 2.5}" height="${ch * 6}" fill="#b0b8c4" stroke="#2d3748" stroke-width="5"/>`);

  return lines.join("\n");
}

function wrap(body, id) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" id="${id}">
${body}
</svg>`;
}

writeFileSync(join(outDir, "mega-ground.svg"), wrap(buildGround(), "mega-ground"));
writeFileSync(join(outDir, "mega-first.svg"), wrap(buildFirst(), "mega-first"));
console.log("Wrote public/maps/mega-ground.svg and mega-first.svg");
