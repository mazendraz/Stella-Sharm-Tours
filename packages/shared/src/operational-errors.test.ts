import { afterEach, expect, it, vi } from 'vitest';
import { reportOperationalError } from './operational-errors';
afterEach(() => vi.unstubAllGlobals());
it('is opt-in, uses HTTPS and sends only code/service without automatic PII context', async () => {
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', send);
  expect(await reportOperationalError('web', 'web_render_error', '')).toBe(
    false,
  );
  expect(
    await reportOperationalError(
      'web',
      'web_render_error',
      'http://publicpublicpublic@errors.example.test/1',
    ),
  ).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(
    await reportOperationalError(
      'web',
      'web_render_error',
      'https://publicpublicpublic@errors.example.test/prefix/1',
    ),
  ).toBe(true);
  expect(send.mock.calls[0]?.[0].href).toBe(
    'https://errors.example.test/prefix/api/1/envelope/',
  );
  const lines = send.mock.calls[0]?.[1].body.split('\n');
  const event = JSON.parse(lines[2]);
  expect(Object.keys(event).sort()).toEqual(
    [
      'event_id',
      'timestamp',
      'platform',
      'level',
      'message',
      'tags',
      'fingerprint',
    ].sort(),
  );
  expect(event.message).toBe('web_render_error');
  expect(event.tags).toEqual({ service: 'web' });
  expect(send.mock.calls[0]?.[1].redirect).toBe('error');
});
it('never breaks the application when error ingestion is down', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect(
    await reportOperationalError(
      'api',
      'unexpected_api_error',
      'https://publicpublicpublic@errors.example.test/1',
    ),
  ).toBe(false);
});
