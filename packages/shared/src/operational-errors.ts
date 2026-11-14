/** Allowlisted events only. Raw errors, URLs, users, headers and form values are never accepted. */
export const operationalCodes = [
  'unexpected_api_error',
  'worker_task_failed',
  'web_render_error',
  'admin_render_error',
  'web_client_error',
] as const;
type Code = (typeof operationalCodes)[number];
let windowStart = 0;
let sent = 0;
export async function reportOperationalError(
  service: 'api' | 'worker' | 'web' | 'admin',
  code: Code,
  dsn = process.env.SENTRY_DSN,
): Promise<boolean> {
  if (!dsn || !operationalCodes.includes(code)) return false;
  try {
    const address = new URL(dsn);
    const parts = address.pathname.split('/').filter(Boolean);
    const project = parts.pop();
    if (
      address.protocol !== 'https:' ||
      !/^[a-zA-Z0-9]{16,128}$/.test(address.username) ||
      address.password ||
      !/^\d+$/.test(project ?? '') ||
      address.search ||
      address.hash
    )
      return false;
    const now = Date.now();
    if (now - windowStart > 60000) {
      windowStart = now;
      sent = 0;
    }
    if (sent >= 30) return false;
    sent++;
    address.username = '';
    address.pathname =
      '/' + [...parts, 'api', project, 'envelope', ''].join('/');
    const id = crypto.randomUUID().replaceAll('-', '');
    const event = {
      event_id: id,
      timestamp: now / 1000,
      platform: 'javascript',
      level: 'error',
      message: code,
      tags: { service },
      fingerprint: [service, code],
    };
    const body = [
      JSON.stringify({ event_id: id, dsn }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
      '',
    ].join('\n');
    const response = await fetch(address, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
