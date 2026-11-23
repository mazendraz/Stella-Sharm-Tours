import { describe, expect, it } from 'vitest';
import { summarizeError } from './error-summary';

describe('summarizeError', () => {
  it('keeps diagnostics and the database cause', () => {
    const cause = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
      constraint: 'trips_pkey',
    });
    const summary = summarizeError(new Error('Failed query', { cause }));
    expect(summary.name).toBe('Error');
    expect(summary.message).toBe('Failed query');
    expect(summary.stack?.length).toBeGreaterThan(0);
    expect(summary.cause).toMatchObject({
      message: 'deadlock detected',
      code: '40P01',
      constraint: 'trips_pkey',
    });
  });

  it('masks customer contact details a driver might echo', () => {
    const summary = summarizeError(
      new Error('Key (phone, email)=(+20 100 123 4567, guest@example.com)'),
    );
    expect(summary.message).not.toContain('guest@example.com');
    expect(summary.message).not.toContain('123 4567');
    expect(summary.message).toContain('[email]');
    expect(summary.message).toContain('[number]');
  });

  it('handles thrown non-errors', () => {
    expect(summarizeError('boom')).toEqual({
      name: 'string',
      message: 'boom',
    });
  });
});
