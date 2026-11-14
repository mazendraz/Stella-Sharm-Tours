// This suite exercises the isolated, read-only catalog fixture, never a live API.
export default async function setup() {
  for (const [url, fixture] of [
    ['http://127.0.0.1:4100/healthz', true],
    ['http://127.0.0.1:3000/healthz', false],
  ] as const) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`QA service unavailable: ${url}`);
    const data = await response.json();
    if (data.status !== 'ok' || (fixture && data.fixture !== true))
      throw new Error(`Unexpected QA service: ${url}`);
  }
}
