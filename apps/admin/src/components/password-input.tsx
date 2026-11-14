'use client';
import { useState, type ComponentPropsWithRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAdmin } from '../lib/admin-context';
// A password field with a show/hide toggle. The toggle is a real button with a
// translated label and aria-pressed, so screen readers announce the state.
export function PasswordInput(
  props: Omit<ComponentPropsWithRef<'input'>, 'type'>,
) {
  const { t } = useAdmin();
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-field">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={t(visible ? 'hidePassword' : 'showPassword')}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff size={20} aria-hidden="true" />
        ) : (
          <Eye size={20} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
