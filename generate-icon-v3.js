const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <path d="M 128 28 A 100 100 0 1 1 28 128" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>
  <circle cx="128" cy="128" r="12" fill="#ffffff"/>
</svg>`;

const SIZES = [16, 32, 48, 64, 128, 256];

async function generatePNG(svgBuffer, size) {
  return sharp(svgBuffer)
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

async function buildICO(pngBuffers) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const directorySize = dirEntrySize * numImages;
  let dataOffset = headerSize + directorySize;

  // ICO header: reserved(2) + type(2) + count(2)
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // type: 1 = ICO
  header.writeUInt16LE(numImages, 4);  // number of images

  const dirEntries = [];
  const imageDataChunks = [];

  for (let i = 0; i < numImages; i++) {
    const size = SIZES[i];
    const pngData = pngBuffers[i];

    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);   // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1);   // height (0 means 256)
    entry.writeUInt8(0, 2);                          // color palette
    entry.writeUInt8(0, 3);                          // reserved
    entry.writeUInt16LE(1, 4);                       // color planes
    entry.writeUInt16LE(32, 6);                      // bits per pixel
    entry.writeUInt32LE(pngData.length, 8);          // image data size
    entry.writeUInt32LE(dataOffset, 12);             // offset to image data

    dirEntries.push(entry);
    imageDataChunks.push(pngData);
    dataOffset += pngData.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageDataChunks]);
}

async function main() {
  const outDir = path.resolve(__dirname);
  const svgBuffer = Buffer.from(SVG);

  // Generate the 256x256 icon.png
  const png256 = await generatePNG(svgBuffer, 256);
  const pngPath = path.join(outDir, 'icon.png');
  fs.writeFileSync(pngPath, png256);
  console.log(`Wrote ${pngPath} (${png256.length} bytes)`);

  // Generate PNGs at all ICO sizes
  const pngBuffers = [];
  for (const size of SIZES) {
    const buf = await generatePNG(svgBuffer, size);
    pngBuffers.push(buf);
    console.log(`  Generated ${size}x${size} PNG (${buf.length} bytes)`);
  }

  // Assemble ICO
  const ico = await buildICO(pngBuffers);
  const icoPath = path.join(outDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`Wrote ${icoPath} (${ico.length} bytes)`);

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
