import { headers } from 'next/headers';
import {
  isDisplayCurrency,
  type DisplayCurrency,
} from '@stella/shared/display-currency';
/** Server components: the display currency the middleware chose. */
export async function getCurrency(): Promise<DisplayCurrency> {
  const value = (await headers()).get('x-stella-currency');
  return isDisplayCurrency(value) ? value : 'EUR';
}
