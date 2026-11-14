/** Never forward upstream bodies, credentials or network details to a probe. */
export async function apiReady(base: string | undefined): Promise<boolean> {
  try {
    if (!base) return false;
    const options = {
      cache: 'no-store' as const,
      redirect: 'error' as const,
      signal: AbortSignal.timeout(3000),
    };
    const response = await fetch(new URL('/readyz', base), options);
    if (!response.ok) return false;
    const value: unknown = await response.json();
    return (
      typeof value === 'object' &&
      value !== null &&
      'status' in value &&
      value.status === 'ok'
    );
  } catch {
    return false;
  }
}
