'use client';
import { useEffect } from 'react';
export function ErrorTracking({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const report = () => {
      if (Date.now() - last < 10000) return;
      last = Date.now();
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"code":"web_client_error"}',
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('error', report);
    window.addEventListener('unhandledrejection', report);
    return () => {
      window.removeEventListener('error', report);
      window.removeEventListener('unhandledrejection', report);
    };
  }, [enabled]);
  return null;
}
