import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyTrip } from '@/components/my-trip';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t('myTrip') + ' | Stella Sharm Tours',
    robots: { index: false, follow: true },
  };
}

export default function MyTripPage() {
  return <MyTrip />;
}
