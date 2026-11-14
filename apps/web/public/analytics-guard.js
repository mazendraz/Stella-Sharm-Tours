// Loaded before the optional self-hosted tracker. No form values or private routes.
window.stellaAnalytics = function (type, payload) {
  if (type !== 'event' || !payload || typeof payload.url !== 'string')
    return null;
  try {
    const url = new URL(payload.url, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !/^\/[a-z]{2,3}(?:-[A-Za-z0-9]+)?(?:\/(?:[ct]\/[a-z0-9-]+|contact|faq|legal\/[a-z-]+))?\/?$/.test(
        url.pathname,
      )
    )
      return null;
    const data = {};
    for (const key of ['slug', 'locale', 'from', 'to', 'index']) {
      const value = payload.data?.[key];
      if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (typeof value === 'string' && /^[a-z0-9-]{1,120}$/.test(value))
      )
        data[key] = value;
    }
    return {
      website: payload.website,
      hostname: window.location.hostname,
      screen: payload.screen,
      language: payload.language,
      url: url.pathname,
      referrer: payload.referrer ? new URL(payload.referrer).origin : '',
      ...(typeof payload.name === 'string' &&
      /^[a-z_]{1,60}$/.test(payload.name)
        ? { name: payload.name }
        : {}),
      data,
    };
  } catch {
    return null;
  }
};
