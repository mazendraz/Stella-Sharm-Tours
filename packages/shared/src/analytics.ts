export function analyticsConfig(
  siteUrl: string,
  script?: string,
  website?: string,
) {
  if (
    !script ||
    !website ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      website,
    )
  )
    return null;
  try {
    const url = new URL(script);
    const site = new URL(siteUrl);
    const base = site.hostname.replace(/^(?:www|staging)\./, '');
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'stats.' + base ||
      url.pathname !== '/script.js' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return { script: url.href, origin: url.origin, website };
  } catch {
    return null;
  }
}
