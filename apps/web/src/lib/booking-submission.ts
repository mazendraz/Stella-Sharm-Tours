import { submissionDetails, type Booking } from '@stella/shared/booking';

const storageKey = 'stella.booking-tab';
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export function bookingTabSeed() {
  const seed = hex(crypto.getRandomValues(new Uint8Array(32)));
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
    sessionStorage.setItem(storageKey, seed);
  } catch {
    /* The current form can still retry. */
  }
  return seed;
}

export async function bookingSubmissionId(booking: Booking, seed: string) {
  const bytes = new TextEncoder().encode(
    seed + JSON.stringify(submissionDetails(booking)),
  );
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}
