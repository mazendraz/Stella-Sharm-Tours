import { HTTPException } from 'hono/http-exception';

type FailStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503;
/** Machine-readable facts the admin uses to explain a refusal (ids, reasons). */
export type FailDetails = Record<string, string | number | boolean | null>;

export class ApiFailure extends HTTPException {
  constructor(
    status: FailStatus,
    code: string,
    readonly details?: FailDetails,
  ) {
    super(status, { message: code });
  }
}

export function fail(
  status: FailStatus,
  code: string,
  details?: FailDetails,
): never {
  throw new ApiFailure(status, code, details);
}
