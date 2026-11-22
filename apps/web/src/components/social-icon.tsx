// Small outline glyphs for the social links staff set in Admin → Settings.
// Lucide no longer ships brand icons, so these are drawn here (24px grid,
// stroke = currentColor) to match the rest of the icon set.
import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  instagram: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
    </>
  ),
  facebook: (
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  ),
  tripadvisor: (
    <>
      <path d="M2 9c2.6-2.4 6.1-3.6 10-3.6S19.4 6.6 22 9" />
      <circle cx="6.5" cy="13.5" r="4" />
      <circle cx="17.5" cy="13.5" r="4" />
      <circle cx="6.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="17.5" cy="13.5" r="1" fill="currentColor" />
      <path d="m10.5 14.5 1.5 2.5 1.5-2.5" />
    </>
  ),
  'google maps': (
    <>
      <path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  youtube: (
    <>
      <path d="M2.5 17a24 24 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24 24 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </>
  ),
  tiktok: <path d="M9 12a4 4 0 1 0 4 4V2a5 5 0 0 0 5 5" />,
};
const globe = (
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
  </>
);

export function SocialIcon({
  label,
  size = 18,
}: {
  label: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[label.trim().toLowerCase()] ?? globe}
    </svg>
  );
}

/** The Google Maps entry doubles as the "find us" link next to the address. */
export function isMapLink(label: string) {
  return label.trim().toLowerCase() === 'google maps';
}
