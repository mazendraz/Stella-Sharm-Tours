'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Panel } from './primitives';
import { useTripStore } from './store';
import { TripNavigation } from './tab-bar';
import { readPanelVisit, rememberPanelScroll } from './panel-history';

type OverlayProps = {
  children: ReactNode;
  kind: 'collection' | 'trip' | 'builder';
};

export function Overlay(props: OverlayProps) {
  const path = usePathname();
  return <RoutedPanel key={path} path={path} {...props} />;
}

function RoutedPanel({
  children,
  kind,
  path,
}: OverlayProps & { path: string }) {
  const router = useRouter(),
    t = useTranslations(),
    clip = useTripStore((s) => s.clip);
  const [visit] = useState(() => readPanelVisit(path));
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
      restored={visit.restored}
      immediateClose={visit.fromPanel}
      scrollTop={visit.scrollTop}
      onPanelScroll={(scrollTop) => rememberPanelScroll(path, scrollTop)}
      footer={<TripNavigation inPanel />}
    >
      {children}
    </Panel>
  );
}
