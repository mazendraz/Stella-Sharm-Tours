'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Panel } from './primitives';
import { useTripStore } from './store';
import { TabBar } from './tab-bar';
export function Overlay({
  children,
  kind,
}: {
  children: ReactNode;
  kind: 'collection' | 'trip' | 'builder';
}) {
  const router = useRouter(),
    t = useTranslations(),
    clip = useTripStore((s) => s.clip);
  useEffect(() => {
    useTripStore.setState({ overlay: true });
    return () => {
      useTripStore.setState({ overlay: false });
    };
  }, []);
  return (
    <Panel
      open
      onClose={() => router.back()}
      title={t(kind === 'builder' ? 'myTrip' : 'journeys')}
      kind={kind}
      clip={clip}
    >
      {children}
      {kind === 'builder' && <TabBar />}
    </Panel>
  );
}
