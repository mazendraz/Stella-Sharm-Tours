'use client';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useAdmin } from '../../lib/admin-context';

/** Small dialogs only: confirm, reauth, invite, FAQ item, pickers, create forms. */
export function Modal({
  title,
  description,
  children,
  onClose,
  size = 'md',
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}) {
  const { t } = useAdmin();
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={'dialog dialog-' + size}>
          <div className="dialog-head">
            <Dialog.Title className="dialog-title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('close')}
              >
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="muted dialog-desc">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-actions">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type ConfirmOptions = {
  title: string;
  body?: ReactNode | undefined;
  confirmLabel: string;
  cancelLabel?: string | undefined;
  tone?: 'default' | 'danger' | undefined;
  details?: ReactNode[] | undefined;
  requireText?: string | undefined;
};
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(
  async () => false,
);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          {...pending}
          onDone={(ok) => {
            pending.resolve(ok);
            setPending(null);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  details,
  requireText,
  onDone,
}: ConfirmOptions & { onDone: (ok: boolean) => void }) {
  const { t } = useAdmin(),
    [typed, setTyped] = useState(''),
    cancelRef = useRef<HTMLButtonElement>(null),
    danger = tone === 'danger',
    blocked = !!requireText && typed.trim() !== requireText;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onDone(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="dialog dialog-sm"
          role="alertdialog"
          onOpenAutoFocus={(event) => {
            if (danger && !requireText) {
              event.preventDefault();
              cancelRef.current?.focus();
            }
          }}
        >
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="confirm-body">{body}</div>
          </Dialog.Description>
          {details && details.length > 0 && (
            <ul className="confirm-details">
              {details.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              // Enter confirms only non-danger dialogs (or a typed confirmation).
              if ((!danger || requireText) && !blocked) onDone(true);
            }}
          >
            {requireText && (
              <div className="field">
                <label htmlFor="confirm-text">
                  {t('typeToConfirm', { text: requireText })}
                </label>
                <input
                  id="confirm-text"
                  value={typed}
                  autoComplete="off"
                  autoFocus
                  onChange={(event) => setTyped(event.target.value)}
                />
              </div>
            )}
            <div className="dialog-actions">
              <button
                ref={cancelRef}
                type="button"
                className="btn"
                onClick={() => onDone(false)}
              >
                {cancelLabel ?? t('cancel')}
              </button>
              <button
                type={danger ? 'button' : 'submit'}
                className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')}
                disabled={blocked}
                onClick={danger ? () => !blocked && onDone(true) : undefined}
              >
                {confirmLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
