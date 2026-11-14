import { reportOperationalError } from '@stella/shared/operational-errors';
export function onRequestError() {
  console.error(
    JSON.stringify({ service: 'admin', code: 'admin_render_error' }),
  );
  void reportOperationalError('admin', 'admin_render_error');
}
