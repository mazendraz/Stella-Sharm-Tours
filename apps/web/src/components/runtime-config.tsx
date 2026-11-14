'use client';
import { createContext, useContext, type ReactNode } from 'react';
const ApiOrigin = createContext<string | null>(null);
/** Public URL only: injected by the server at request time, never a secret. */
export function RuntimeConfig({
  apiOrigin,
  children,
}: {
  apiOrigin: string;
  children: ReactNode;
}) {
  return <ApiOrigin.Provider value={apiOrigin}>{children}</ApiOrigin.Provider>;
}
export function useApiOrigin() {
  const value = useContext(ApiOrigin);
  if (!value) throw new Error('Public runtime configuration is missing');
  return value;
}
