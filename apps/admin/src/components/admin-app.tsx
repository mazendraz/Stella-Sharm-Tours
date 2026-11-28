'use client';
import { Suspense, useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { can, type Permission } from '@stella/shared/admin';
import { useAdmin } from '../lib/admin-context';
import { GuardProvider } from '../lib/guard';
import { Auth } from './auth';
import { ConfirmProvider } from './ui/dialog';
import { AppShell, MorePage, activeNav } from './ui/app-shell';
import { EmptyState, Skeleton } from './ui/states';
import { AppLink } from './ui/link';

const Overview = dynamic(() =>
  import('../screens/overview').then((m) => m.Overview),
);
const Requests = dynamic(() =>
  import('../screens/requests').then((m) => m.Requests),
);
const TripsList = dynamic(() =>
  import('../screens/trips').then((m) => m.TripsList),
);
const TripEditor = dynamic(() =>
  import('../screens/trip-editor').then((m) => m.TripEditor),
);
const PackagesList = dynamic(() =>
  import('../screens/packages').then((m) => m.PackagesList),
);
const PackageEditor = dynamic(() =>
  import('../screens/packages').then((m) => m.PackageEditor),
);
const CollectionsList = dynamic(() =>
  import('../screens/collections').then((m) => m.CollectionsList),
);
const CollectionEditor = dynamic(() =>
  import('../screens/collections').then((m) => m.CollectionEditor),
);
const Prices = dynamic(() => import('../screens/prices').then((m) => m.Prices));
const MediaLibrary = dynamic(() =>
  import('../screens/media').then((m) => m.MediaLibrary),
);
const MediaDetail = dynamic(() =>
  import('../screens/media').then((m) => m.MediaDetail),
);
const HeroList = dynamic(() =>
  import('../screens/hero').then((m) => m.HeroList),
);
const HeroEditor = dynamic(() =>
  import('../screens/hero').then((m) => m.HeroEditor),
);
const Homepage = dynamic(() =>
  import('../screens/homepage').then((m) => m.Homepage),
);
const PagesIndex = dynamic(() =>
  import('../screens/pages').then((m) => m.PagesIndex),
);
const FaqEditor = dynamic(() =>
  import('../screens/pages').then((m) => m.FaqEditor),
);
const StaticPageEditor = dynamic(() =>
  import('../screens/pages').then((m) => m.StaticPageEditor),
);
const Translations = dynamic(() =>
  import('../screens/translations').then((m) => m.Translations),
);
const LanguageSettings = dynamic(() =>
  import('../screens/languages').then((m) => m.LanguageSettings),
);
const SettingsScreen = dynamic(() =>
  import('../screens/settings').then((m) => m.SettingsScreen),
);
const Team = dynamic(() => import('../screens/team').then((m) => m.Team));
const Member = dynamic(() => import('../screens/team').then((m) => m.Member));
const Activity = dynamic(() =>
  import('../screens/activity').then((m) => m.Activity),
);
const Account = dynamic(() =>
  import('../screens/account').then((m) => m.Account),
);

export function AdminApp() {
  const { me, loading } = useAdmin();
  if (loading)
    return (
      <main className="boot">
        <Skeleton rows={3} />
      </main>
    );
  if (!me) return <Auth key="signed-out" />;
  return (
    <ConfirmProvider>
      <GuardProvider>
        <Routes />
      </GuardProvider>
    </ConfirmProvider>
  );
}

/** Old addresses keep working. */
const redirects: Record<string, string> = {
  '/queue': '/translations',
  '/languages': '/settings/languages',
  '/users': '/team',
};

function Routes() {
  const { me, t } = useAdmin(),
    path = usePathname() || '/',
    router = useRouter(),
    parts = path.split('/').filter(Boolean),
    [section, id, sub] = parts;
  useEffect(() => {
    const target = redirects['/' + (section ?? '')];
    if (target) router.replace(target);
  }, [section, router]);
  const allowed = (permission: Permission | null) =>
    !permission || can(me!.role, permission);
  const guard = (permission: Permission | null, node: ReactNode) =>
    allowed(permission) ? node : <NoAccess />;
  let screen: ReactNode;
  switch (section) {
    case undefined:
      screen = <Overview />;
      break;
    case 'requests':
      screen = guard('requests', <Requests {...(id ? { id } : {})} />);
      break;
    case 'trips':
      screen = guard(
        'content',
        id ? <TripEditor key={id} id={id} /> : <TripsList />,
      );
      break;
    case 'packages':
      screen = guard(
        'content',
        id ? <PackageEditor key={id} id={id} /> : <PackagesList />,
      );
      break;
    case 'collections':
      screen = guard(
        'content',
        id ? <CollectionEditor key={id} id={id} /> : <CollectionsList />,
      );
      break;
    case 'prices':
      screen = guard('prices', <Prices />);
      break;
    case 'media':
      screen = guard(
        'content',
        id ? <MediaDetail key={id} id={id} /> : <MediaLibrary />,
      );
      break;
    case 'hero':
      screen = guard(
        'heroDraft',
        id ? <HeroEditor key={id} id={id} /> : <HeroList />,
      );
      break;
    case 'homepage':
      screen = guard('content', <Homepage />);
      break;
    case 'pages':
      screen = guard(
        'content',
        !id ? (
          <PagesIndex />
        ) : id === 'faq' ? (
          <FaqEditor />
        ) : (
          <StaticPageEditor key={id} pageKey={id} />
        ),
      );
      break;
    case 'translations':
    case 'queue':
      screen = guard('translations', <Translations />);
      break;
    case 'settings':
      screen =
        id === 'languages'
          ? guard('languages', <LanguageSettings />)
          : guard('settings', <SettingsScreen />);
      break;
    case 'languages':
      screen = guard('languages', <LanguageSettings />);
      break;
    case 'team':
    case 'users':
      screen = guard('users', id ? <Member key={id} id={id} /> : <Team />);
      break;
    case 'activity':
      screen = guard('audit', <Activity />);
      break;
    case 'account':
      screen = <Account />;
      break;
    case 'more':
      screen = <MorePage />;
      break;
    default:
      screen = <NotFound />;
  }
  void sub;
  const current = activeNav(path);
  return (
    <AppShell path={path} title={t(current === 'more' ? 'more' : current)}>
      <Suspense key={path} fallback={<Skeleton rows={3} />}>
        {screen}
      </Suspense>
    </AppShell>
  );
}

function NoAccess() {
  const { t } = useAdmin();
  return (
    <div className="page">
      <EmptyState
        variant="error"
        title={t('noAccessTitle')}
        body={t('forbidden')}
        action={
          <AppLink className="btn" href="/">
            {t('backToOverview')}
          </AppLink>
        }
      />
    </div>
  );
}

function NotFound() {
  const { t } = useAdmin();
  return (
    <div className="page">
      <EmptyState
        title={t('notFoundTitle')}
        body={t('notFoundBody')}
        action={
          <AppLink className="btn" href="/">
            {t('backToOverview')}
          </AppLink>
        }
      />
    </div>
  );
}
