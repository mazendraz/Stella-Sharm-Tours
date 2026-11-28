'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { DisplayCurrency } from '@stella/shared/display-currency';
const Currency = createContext<DisplayCurrency>('EUR');
/** The sign shown next to every price; chosen by the server per request. */
export function CurrencyProvider({
  currency,
  children,
}: {
  currency: DisplayCurrency;
  children: ReactNode;
}) {
  return <Currency.Provider value={currency}>{children}</Currency.Provider>;
}
export const useCurrency = () => useContext(Currency);
