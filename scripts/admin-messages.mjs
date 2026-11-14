import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = JSON.parse(
  await readFile(
    new URL('../data/i18n/admin-ui.json', import.meta.url),
    'utf8',
  ),
);
Object.assign(
  source,
  JSON.parse(
    await readFile(
      new URL('../data/i18n/admin-fields.json', import.meta.url),
      'utf8',
    ),
  ),
);
// Admin rebuild (2026-11): new screens' strings; overrides older wording.
Object.assign(
  source,
  JSON.parse(
    await readFile(
      new URL('../data/i18n/admin-rebuild.json', import.meta.url),
      'utf8',
    ),
  ),
);
const locales = ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr'];
for (const [key, values] of Object.entries(source))
  if (
    values.length !== 7 ||
    values.some((value) => typeof value !== 'string' || !value.trim())
  )
    throw new Error('Missing admin translation: ' + key);
await mkdir(new URL('../apps/admin/messages/', import.meta.url), {
  recursive: true,
});
for (const [index, locale] of locales.entries())
  await writeFile(
    new URL(`../apps/admin/messages/${locale}.json`, import.meta.url),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(source).map(([key, values]) => [key, values[index]]),
      ),
      null,
      2,
    ) + '\n',
  );
await mkdir(new URL('../apps/admin/public/', import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL('../apps/admin/public/offline-messages.json', import.meta.url),
  JSON.stringify(
    Object.fromEntries(
      locales.map((locale, index) => [
        locale,
        Object.fromEntries(
          ['offline', 'requests', 'trips', 'prices', 'media', 'more'].map(
            (key) => [key, source[key][index]],
          ),
        ),
      ]),
    ),
    null,
    2,
  ) + '\n',
);
