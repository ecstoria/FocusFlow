const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZE = 256;
const BLUE = '#0f3460';
const RED = '#e94560';

const blueRadius = Math.round(SIZE * 0.8 / 2);
const redRadius = Math.round(SIZE * 0.2 / 2);
const center = SIZE / 2;

const svg = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${center}" cy="${center}" r="${blueRadius}" fill="${BLUE}" />
  <circle cx="${center}" cy="${center}" r="${redRadius}" fill="${RED}" />
</svg>
`;

function createIco(pngBuffers) {
  // ICO file format: header + directory entries + image data
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * numImages;
  let dataOffset = headerSize + dirSize;

  // Header: reserved(2) + type(2) + count(2)
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: 1 = ICO
  header.writeUInt16LE(numImages, 4);

  const dirEntries = [];
  const offsets = [];
  for (const buf of pngBuffers) {
    offsets.push(dataOffset);
    dataOffset += buf.length;
  }

  // We'll determine size from the PNG header for each
  const sizes = [16, 32, 48, 64, 128, 256];
  for (let i = 0; i < numImages; i++) {
    const entry = Buffer.alloc(dirEntrySize);
    const s = sizes[i];
    entry.writeUInt8(s < 256 ? s : 0, 0);   // width (0 = 256)
    entry.writeUInt8(s < 256 ? s : 0, 1);   // height (0 = 256)
    entry.writeUInt8(0, 2);                   // color palette
    entry.writeUInt8(0, 3);                   // reserved
    entry.writeUInt16LE(1, 4);               // color planes
    entry.writeUInt16LE(32, 6);              // bits per pixel
    entry.writeUInt32LE(pngBuffers[i].length, 8);  // image size
    entry.writeUInt32LE(offsets[i], 12);     // offset
    dirEntries.push(entry);
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

async function main() {
  const outputDir = __dirname;
  const pngPath = path.join(outputDir, 'icon.png');
  const icoPath = path.join(outputDir, 'icon.ico');

  // Generate 256x256 PNG with transparent background
  const pngBuffer = await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .png()
    .toBuffer();
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`Created ${pngPath} (${SIZE}x${SIZE})`);

  // Generate multiple sizes for ICO
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    sizes.map(s => sharp(Buffer.from(svg)).resize(s, s).png().toBuffer())
  );

  const icoBuffer = createIco(pngBuffers);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Created ${icoPath} (sizes: ${sizes.join(', ')})`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
