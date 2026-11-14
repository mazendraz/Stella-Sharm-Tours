(async () => {
  const messages = await (await fetch('/offline-messages.json')).json();
  const saved = document.cookie
    .split('; ')
    .find((value) => value.startsWith('stella_admin_locale='))
    ?.split('=')[1];
  const locale = Object.hasOwn(messages, saved) ? saved : 'en';
  document.documentElement.lang = locale;
  document.getElementById('notice').textContent = messages[locale].offline;
  for (const key of ['requests', 'trips', 'prices', 'media', 'more']) {
    const anchor = document.createElement('a');
    anchor.href = '/' + key;
    anchor.textContent = messages[locale][key];
    anchor.style.padding = '12px';
    document.getElementById('navigation').append(anchor);
  }
})();
