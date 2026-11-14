// Render the existing project SVG mark for install surfaces that require PNG.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const sharp = createRequire(resolve('apps/api/package.json'))('sharp');
for (const size of [180, 192, 512]) {
  await sharp('apps/admin/public/icon.svg')
    .resize(size, size)
    .png()
    .toFile(`apps/admin/public/icon-${size}.png`);
}
