import { notFound } from 'next/navigation';
import { Confirmation } from '@/components/confirmation';
export const metadata = { robots: { index: false, follow: false } };
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  if (!/^STL-[A-Z0-9]{3,30}$/.test(ref)) notFound();
  return <Confirmation reference={ref} />;
}
