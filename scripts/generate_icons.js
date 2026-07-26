const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "icons");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const navy = [0, 47, 69, 255];
  const cream = [240, 229, 200, 255];
  const scale = size / 512;

  function setPixel(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    pixels.set(color, offset);
  }

  function fill(color) {
    for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
  }

  function line(x0, y0, x1, y1, width, color) {
    x0 *= scale; y0 *= scale; x1 *= scale; y1 *= scale; width *= scale;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const radius = width / 2;
      for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++) {
        for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2) setPixel(xx, yy, color);
        }
      }
    }
  }

  function rect(x, y, width, height, color) {
    const left = Math.round(x * scale), top = Math.round(y * scale);
    const right = Math.round((x + width) * scale), bottom = Math.round((y + height) * scale);
    for (let yy = top; yy < bottom; yy++) for (let xx = left; xx < right; xx++) setPixel(xx, yy, color);
  }

  function circle(cx, cy, radius, color) {
    cx *= scale; cy *= scale; radius *= scale;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(x, y, color);
      }
    }
  }

  fill(navy);

  // A simple chapel mark, kept inside the maskable-icon safe area.
  line(128, 244, 256, 142, 13, cream);
  line(256, 142, 384, 244, 13, cream);
  line(145, 238, 145, 405, 13, cream);
  line(367, 238, 367, 405, 13, cream);
  line(145, 405, 367, 405, 13, cream);
  line(220, 170, 220, 405, 12, cream);
  line(292, 170, 292, 405, 12, cream);
  line(220, 170, 292, 170, 12, cream);
  line(256, 72, 256, 142, 12, cream);
  line(232, 96, 280, 96, 12, cream);

  circle(183, 291, 14, cream);
  circle(329, 291, 14, cream);
  rect(244, 326, 24, 79, cream);

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const [filename, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), renderIcon(size));
  console.log("written", filename);
}
