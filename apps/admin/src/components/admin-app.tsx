'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Map,
  Tags,
  Images,
  Grid2X2,
  Film,
  Layers,
  Package,
  House,
  Languages,
  Users,
  Settings,
  History,
  User,
  FileText,
} from 'lucide-react';
import { can, type Permission } from '@stella/shared/admin';
import { useAdmin, useData } from '../lib/admin-context';
import { Auth } from './auth';
import { LanguageSelect, Loading } from './ui';
import { Requests } from './requests';
import { Trips, Prices, Collections, Packages } from './trips';
import { Media, Heroes } from './media';
import {
  ContentPages,
  Homepage,
  LanguageSettings,
  TranslationQueue,
  SettingsScreen,
  UsersScreen,
  Activity,
  Account,
} from './management';
const menu = [
  ['requests', Inbox, 'requests'],
  ['trips', Map, 'content'],
  ['prices', Tags, 'prices'],
  ['media', Images, 'content'],
  ['hero', Film, 'heroDraft'],
  ['collections', Layers, 'content'],
  ['packages', Package, 'content'],
  ['homepage', House, 'content'],
  ['pages', FileText, 'content'],
  ['languages', Languages, 'languages'],
  ['queue', Languages, 'translations'],
  ['settings', Settings, 'settings'],
  ['users', Users, 'users'],
  ['activity', History, 'audit'],
  ['account', User, null],
] as const;
export function AdminApp() {
  const { me, loading } = useAdmin();
  if (loading)
    return (
      <main className="main-wrap">
        <Loading />
      </main>
    );
  if (!me?.mfa_passed) return <Auth key={me?.id ?? 'signed-out'} />;
  return <Shell />;
}
function Shell() {
  const { me, t } = useAdmin(),
    path = usePathname(),
    segment = path.split('/')[1] || 'requests';
  const permitted = menu.filter(
    ([, , permission]) =>
      !permission || can(me!.role, permission as Permission),
  );
  const selected = permitted.find(([name]) => name === segment);
  return (
    <div
      className="app-shell"
      onClickCapture={(event) => {
        const link = (event.target as Element).closest('a[href]');
        if (
          link &&
          !link.getAttribute('href')?.startsWith('#') &&
          document.querySelector('form[data-dirty="true"]') &&
          !window.confirm(t('unsaved'))
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <a className="skip" href="#main">
        {t('skip')}
      </a>
      <aside className="sidebar">
        <Link href="/" className="wordmark">
          <img
            className="brand-mark"
            src="/brand/mark.webp"
            alt=""
            width={117}
            height={112}
          />
          <img
            className="brand-word"
            src="/brand/wordmark.webp"
            alt="Stella Sharm Tours"
            width={283}
            height={96}
          />
        </Link>
        {permitted.map(([name, Icon]) => (
          <Link
            className={'nav-link ' + (segment === name ? 'active' : '')}
            key={name}
            href={'/' + name}
          >
            <Icon aria-hidden />
            {t(name)}
          </Link>
        ))}
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <Link href="/" className="wordmark">
            <img
              className="brand-mark"
              src="/brand/mark.webp"
              alt=""
              width={117}
              height={112}
            />
            <img
              className="brand-word"
              src="/brand/wordmark.webp"
              alt="Stella Sharm Tours"
              width={283}
              height={96}
            />
          </Link>
          <LanguageSelect />
        </header>
        <main id="main">
          <p className="eyebrow">
            {me!.name} · {t(me!.role)}
          </p>
          <h1>{t(selected?.[0] ?? 'more')}</h1>
          {!selected || segment === 'more' ? (
            <div className="menu-grid">
              {permitted.map(([name, Icon]) => (
                <Link key={name} href={'/' + name}>
                  <Icon aria-hidden />
                  {t(name)}
                </Link>
              ))}
            </div>
          ) : segment === 'requests' ? (
            <Requests />
          ) : segment === 'trips' ? (
            <Trips />
          ) : segment === 'prices' ? (
            <Prices />
          ) : segment === 'collections' ? (
            <Collections />
          ) : segment === 'packages' ? (
            <Packages />
          ) : segment === 'media' ? (
            <Media />
          ) : segment === 'hero' ? (
            <Heroes />
          ) : segment === 'homepage' ? (
            <Homepage />
          ) : segment === 'pages' ? (
            <ContentPages />
          ) : segment === 'languages' ? (
            <LanguageSettings />
          ) : segment === 'queue' ? (
            <TranslationQueue />
          ) : segment === 'settings' ? (
            <SettingsScreen />
          ) : segment === 'users' ? (
            <UsersScreen />
          ) : segment === 'activity' ? (
            <Activity />
          ) : (
            <Account />
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label={t('dashboard')}>
        {permitted
          .filter(([name]) =>
            ['requests', 'trips', 'prices', 'media'].includes(name),
          )
          .map(([name, Icon]) => (
            <Link
              key={name}
              className={'nav-link ' + (name === segment ? 'active' : '')}
              href={'/' + name}
            >
              <Icon aria-hidden />
              {t(name)}
              {name === 'requests' && <RequestBadge />}
            </Link>
          ))}
        <Link
          href="/more"
          className={
            'nav-link ' +
            (!['requests', 'trips', 'prices', 'media'].includes(segment)
              ? 'active'
              : '')
          }
        >
          <Grid2X2 aria-hidden />
          {t('more')}
        </Link>
      </nav>
    </div>
  );
}
function RequestBadge() {
  const query = useData<unknown[]>(
    '/v1/admin/requests?status=new',
    true,
    30000,
  );
  return query.data?.length ? (
    <span className="badge">{query.data.length}</span>
  ) : null;
}
