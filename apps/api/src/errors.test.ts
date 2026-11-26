import { describe, expect, it } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { ApiFailure, fail } from './errors';

describe('API refusals', () => {
  it('keeps the error code as the message and carries optional details', () => {
    let caught: unknown;
    try {
      fail(422, 'MEDIA_NOT_PUBLISHABLE', {
        mediaId: 'm-1',
        reason: 'unknown_rights',
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HTTPException);
    expect(caught).toBeInstanceOf(ApiFailure);
    expect((caught as ApiFailure).status).toBe(422);
    expect((caught as ApiFailure).message).toBe('MEDIA_NOT_PUBLISHABLE');
    expect((caught as ApiFailure).details).toEqual({
      mediaId: 'm-1',
      reason: 'unknown_rights',
    });
  });
  it('omits details when none are given', () => {
    expect(() => fail(404, 'NOT_FOUND')).toThrow(
      expect.objectContaining({ message: 'NOT_FOUND', details: undefined }),
    );
  });
});
