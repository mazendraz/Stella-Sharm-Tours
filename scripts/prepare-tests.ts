import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.local/media-format-qa'),
  path = resolve(root, 'example.heic'),
  expected = '7f8b363e4936c0666a25f64f3a92fda10bd8e5453be4592530b65a55dd98f3f2';
const valid = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex') === expected;
const current = await readFile(path).catch(() => null);
if (current && valid(current))
  console.log('Verified local HEIC fixture is ready.');
else {
  const response = await fetch(
    'https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic',
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error('Official HEIC fixture download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes))
    throw new Error(
      'HEIC fixture changed; review upstream before updating the pin',
    );
  await mkdir(root, { recursive: true });
  await writeFile(path, bytes);
  console.log(
    'Verified libheif HEIC fixture saved for private local tests only.',
  );
}
