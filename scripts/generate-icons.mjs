import { copyFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const rootDir = process.cwd();
const iconsDir = resolve(rootDir, 'public', 'icons');
const sourceCandidates = [
  'icon-source.png',
  'icon.png',
  'icon.jpg',
  'icon.jpeg',
  'icon.webp'
];
const sizes = [16, 32, 48, 128];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findSource() {
  for (const name of sourceCandidates) {
    const path = resolve(iconsDir, name);
    if (await exists(path)) {
      return { name, path };
    }
  }

  throw new Error(`No icon source found in ${iconsDir}. Expected one of: ${sourceCandidates.join(', ')}`);
}

async function main() {
  await mkdir(iconsDir, { recursive: true });
  const source = await findSource();
  const sourceCopy = resolve(iconsDir, 'icon-source.png');

  if (source.name !== 'icon-source.png') {
    await copyFile(source.path, sourceCopy);
  }

  const input = source.name === 'icon-source.png' ? source.path : sourceCopy;
  const metadata = await sharp(input).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const squareSize = Math.min(width, height);

  if (!squareSize) {
    throw new Error('Icon source has invalid dimensions.');
  }

  const left = Math.floor((width - squareSize) / 2);
  const top = Math.floor((height - squareSize) / 2);

  for (const size of sizes) {
    const output = resolve(iconsDir, `icon${size}.png`);
    const artworkSize = Math.max(1, Math.round(size * 0.75));
    const padding = Math.floor((size - artworkSize) / 2);
    const remainingPadding = size - artworkSize - padding;
    await sharp(input)
      .extract({ left, top, width: squareSize, height: squareSize })
      .resize(artworkSize, artworkSize, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3
      })
      .extend({
        top: padding,
        bottom: remainingPadding,
        left: padding,
        right: remainingPadding,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(output);
    console.log(`Generated ${output}`);
  }

  console.log(`Icon source: ${source.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
