import { HTTPException } from 'hono/http-exception';
export function fail(
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503,
  code: string,
): never {
  throw new HTTPException(status, { message: code });
}
