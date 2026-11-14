import { expect, it } from 'vitest';
import { readBoundedText } from './bounded-body';
it('limits chunked bytes rather than trusting Content-Length or decoded character count', async () => {
  const stream = () =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([0xc3]));
        c.enqueue(new Uint8Array([0xa9]));
        c.close();
      },
    });
  const init = { method: 'POST', body: stream(), duplex: 'half' as const };
  expect(
    await readBoundedText(new Request('https://example.test', init), 2),
  ).toBe('é');
  await expect(
    readBoundedText(
      new Request('https://example.test', { ...init, body: stream() }),
      1,
    ),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readBoundedText(
      new Request('https://example.test', {
        method: 'POST',
        body: 'abc',
        headers: { 'Content-Length': '100' },
      }),
      3,
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it('cancels stalled bodies on a deadline', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const init = { method: 'POST', body, duplex: 'half' as const };
  await expect(
    readBoundedText(new Request('https://example.test', init), 64, 30),
  ).rejects.toMatchObject({ status: 408 });
  expect(cancelled).toBe(true);
});
