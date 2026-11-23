/**
 * A log-safe summary of an unexpected error (audit OPS-01). Keeps what an
 * operator needs to diagnose a failure (error class, message, PostgreSQL
 * code and constraint, top stack frames) and never the request: callers pass
 * the error only, not bodies, headers or cookies. Email addresses and long
 * digit runs (phone numbers, tokens) are masked in case a driver echoes data.
 */
export type ErrorSummary = {
  name: string;
  message: string;
  code?: string;
  constraint?: string;
  stack?: string[];
  cause?: ErrorSummary;
};

const redact = (value: string) =>
  value
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]')
    .slice(0, 400);

export function summarizeError(error: unknown, depth = 0): ErrorSummary {
  if (!(error instanceof Error))
    return { name: typeof error, message: redact(String(error)) };
  const extra = error as Error & { code?: unknown; constraint?: unknown };
  const summary: ErrorSummary = {
    name: error.name,
    message: redact(error.message),
  };
  if (typeof extra.code === 'string') summary.code = extra.code.slice(0, 40);
  if (typeof extra.constraint === 'string')
    summary.constraint = extra.constraint.slice(0, 120);
  if (error.stack)
    summary.stack = error.stack
      .split('\n')
      .slice(1, 9)
      .map((line) => redact(line.trim()));
  if (error.cause !== undefined && depth < 2)
    summary.cause = summarizeError(error.cause, depth + 1);
  return summary;
}
