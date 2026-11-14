import { reportOperationalError } from '@stella/shared/operational-errors';
export function onRequestError() {
  console.error(JSON.stringify({ service: 'web', code: 'web_render_error' }));
  void reportOperationalError('web', 'web_render_error');
}
