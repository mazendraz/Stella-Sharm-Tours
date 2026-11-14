export class BodyReadError extends Error {
  constructor(public readonly status: 400 | 408 | 413) {
    super(
      status === 413
        ? 'BODY_TOO_LARGE'
        : status === 408
          ? 'REQUEST_TIMEOUT'
          : 'INVALID_BODY',
    );
  }
}
/** Bound bytes before decoding, including chunked bodies and split UTF-8 input. */
export async function readBoundedText(
  request: Request,
  maxBytes: number,
  timeoutMs = 5000,
): Promise<string> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new BodyReadError(/^\d+$/.test(length) ? 413 : 400);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const input = (async () => {
    let text = '',
      bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) throw new BodyReadError(413);
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } catch (error) {
      if (error instanceof BodyReadError) throw error;
      throw new BodyReadError(400);
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  })();
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new BodyReadError(408));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    return await Promise.race([input, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
