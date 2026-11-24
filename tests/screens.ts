/**
 * Where browser tests write screenshots. Ordinary runs use the ignored
 * test-results/ folder so the working tree stays clean (audit 2026-11-24
 * BUG-02). Set UPDATE_SCREENS=1 to refresh the reviewed copies in docs/screens.
 */
export const screensRoot =
  process.env.UPDATE_SCREENS === '1' ? 'docs/screens' : 'test-results/screens';
export const screenPath = (...parts: string[]) =>
  [screensRoot, ...parts].join('/');
