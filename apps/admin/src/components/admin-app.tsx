'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { can, type Permission } from '@stella/shared/admin';
import { useAdmin } from '../lib/admin-context';
import { GuardProvider } from '../lib/guard';
import { Auth } from './auth';
import { ConfirmProvider } from './ui/dialog';
import { AppShell, MorePage, activeNav } from './ui/app-shell';
import { EmptyState, Skeleton } from './ui/states';
import { AppLink } from './ui/link';
import { Overview } from '../screens/overview';
import { Requests } from '../screens/requests';
import { TripsList } from '../screens/trips';
import { TripEditor } from '../screens/trip-editor';
import { PackagesList, PackageEditor } from '../screens/packages';
import { CollectionsList, CollectionEditor } from '../screens/collections';
import { Prices } from '../screens/prices';
import { MediaLibrary, MediaDetail } from '../screens/media';
import { HeroList, HeroEditor } from '../screens/hero';
import { Homepage } from '../screens/homepage';
import { PagesIndex, FaqEditor, StaticPageEditor } from '../screens/pages';
import { Translations } from '../screens/translations';
import { LanguageSettings } from '../screens/languages';
import { SettingsScreen } from '../screens/settings';
import { Team, Member } from '../screens/team';
import { Activity } from '../screens/activity';
import { Account } from '../screens/account';

export function AdminApp() {
  const { me, loading } = useAdmin();
  if (loading)
    return (
      <main className="boot">
        <Skeleton rows={3} />
      </main>
    );
  if (!me?.mfa_passed) return <Auth key={me?.id ?? 'signed-out'} />;
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
      {screen}
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
