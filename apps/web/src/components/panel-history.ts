'use client';

const visits = new Map<string, { fromPanel: boolean; scrollTop: number }>();
let restoredPath: string | null = null;
const panelHistoryKey = 'stellaPanel';

export function recordPanelLink(link: HTMLAnchorElement) {
  if (
    link.origin !== location.origin ||
    link.pathname === location.pathname ||
    (link.target && link.target !== '_self') ||
    link.hasAttribute('download')
  )
    return;
  const panel = link.closest('.panel-with-footer');
  const current = visits.get(location.pathname);
  if (panel && current) {
    try {
      history.replaceState(
        {
          ...history.state,
          [panelHistoryKey]: { ...current, path: location.pathname },
        },
        '',
      );
    } catch {
      /* Keep the in-memory position if history writes are unavailable. */
    }
  }
  restoredPath = null;
  visits.set(link.pathname, {
    fromPanel: !!panel,
    scrollTop: 0,
  });
}

export function restorePanelPath() {
  restoredPath = location.pathname;
  const saved = history.state?.[panelHistoryKey];
  if (saved?.path === restoredPath)
    visits.set(restoredPath, {
      fromPanel: saved.fromPanel === true,
      scrollTop: Number(saved.scrollTop) || 0,
    });
}

export function readPanelVisit(path: string) {
  const visit = visits.get(path);
  const restored = restoredPath === path;
  return {
    restored,
    fromPanel: visit?.fromPanel ?? false,
    scrollTop: restored ? (visit?.scrollTop ?? 0) : 0,
  };
}

export function rememberPanelScroll(path: string, scrollTop: number) {
  const visit = visits.get(path);
  if (visit) visit.scrollTop = scrollTop;
}
