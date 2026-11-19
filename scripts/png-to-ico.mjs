import fs from 'node:fs';
import path from 'node:path';

const [srcArg, dstArg] = process.argv.slice(2);
if (!srcArg || !dstArg) {
  console.error('Usage: node scripts/png-to-ico.mjs <input.png> <output.ico>');
  process.exit(1);
}

const pngData = fs.readFileSync(path.resolve(srcArg));
if (pngData.length < 24 || pngData[0] !== 0x89 || pngData[1] !== 0x50) {
  throw new Error('Input file is not a valid PNG image.');
}

// Parse PNG width & height from IHDR chunk (bytes 16..23)
const width = pngData.readUInt32BE(16);
const height = pngData.readUInt32BE(20);
const icoW = width >= 256 ? 0 : width;
const icoH = height >= 256 ? 0 : height;

// 6-byte ICONDIR + 16-byte ICONDIRENTRY + raw PNG payload (modern PNG-in-ICO)
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Image type: 1 = ICO
header.writeUInt16LE(1, 4); // Image count: 1
header.writeUInt8(icoW, 6); // Width (0 = 256+)
header.writeUInt8(icoH, 7); // Height (0 = 256+)
header.writeUInt8(0, 8); // Color palette
header.writeUInt8(0, 9); // Reserved
header.writeUInt16LE(1, 10); // Color planes
header.writeUInt16LE(32, 12); // Bits per pixel
header.writeUInt32LE(pngData.length, 14); // Image data size
header.writeUInt32LE(22, 18); // Offset of PNG data

const outPath = path.resolve(dstArg);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, pngData]));
console.log(`[DayRhythm] Generated ICO (${width}x${height}, ${pngData.length + 22} bytes) -> ${outPath}`);
