'use client';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Inbox,
  Map,
  Package,
  Layers,
  Tags,
  House,
  Film,
  Images,
  FileText,
  Languages,
  Globe,
  Settings,
  Users,
  History,
  Grid2X2,
  ChevronRight,
  SearchCheck,
  type LucideIcon,
} from 'lucide-react';
import { can, type Permission } from '@stella/shared/admin';
import { locales, type Locale } from '@stella/shared';
import { useAdmin, useData } from '../../lib/admin-context';
import { useGuard } from '../../lib/guard';
import { AppLink } from './link';
import { Menu } from './menu';

export type NavItem = {
  id: string;
  href: string;
  icon: LucideIcon;
  label: string;
  permission: Permission | null;
};
export const navGroups: {
  label: string | null;
  items: Omit<NavItem, 'label'>[];
}[] = [
  {
    label: null,
    items: [
      { id: 'overview', href: '/', icon: LayoutDashboard, permission: null },
    ],
  },
  {
    label: 'navSales',
    items: [
      {
        id: 'requests',
        href: '/requests',
        icon: Inbox,
        permission: 'requests',
      },
    ],
  },
  {
    label: 'navCatalog',
    items: [
      { id: 'trips', href: '/trips', icon: Map, permission: 'content' },
      {
        id: 'packages',
        href: '/packages',
        icon: Package,
        permission: 'content',
      },
      {
        id: 'collections',
        href: '/collections',
        icon: Layers,
        permission: 'content',
      },
      { id: 'prices', href: '/prices', icon: Tags, permission: 'prices' },
    ],
  },
  {
    label: 'navWebsite',
    items: [
      { id: 'homepage', href: '/homepage', icon: House, permission: 'content' },
      { id: 'hero', href: '/hero', icon: Film, permission: 'heroDraft' },
      { id: 'media', href: '/media', icon: Images, permission: 'content' },
      { id: 'pages', href: '/pages', icon: FileText, permission: 'content' },
      {
        id: 'seoSearch',
        href: '/seo',
        icon: SearchCheck,
        permission: 'content',
      },
    ],
  },
  {
    label: 'navLanguages',
    items: [
      {
        id: 'translations',
        href: '/translations',
        icon: Languages,
        permission: 'translations',
      },
      {
        id: 'languageSettings',
        href: '/settings/languages',
        icon: Globe,
        permission: 'languages',
      },
    ],
  },
  {
    label: 'navAdmin',
    items: [
      {
        id: 'settings',
        href: '/settings',
        icon: Settings,
        permission: 'settings',
      },
      { id: 'team', href: '/team', icon: Users, permission: 'users' },
      { id: 'activity', href: '/activity', icon: History, permission: 'audit' },
    ],
  },
];
const languageNames: Record<Locale, string> = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
  tr: 'Türkçe',
};

export function useNav() {
  const { me } = useAdmin();
  return navGroups
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (item) => !item.permission || (me && can(me.role, item.permission)),
      ),
    }))
    .filter((group) => group.items.length);
}

export function activeNav(path: string) {
  if (path === '/' || path === '') return 'overview';
  if (path.startsWith('/settings/languages')) return 'languageSettings';
  const first = path.split('/')[1] ?? '';
  return (
    (
      {
        queue: 'translations',
        languages: 'languageSettings',
        users: 'team',
        seo: 'seoSearch',
      } as Record<string, string>
    )[first] ?? first
  );
}

export function NewRequestsBadge({
  className = 'nav-badge',
}: {
  className?: string;
}) {
  const { me, t } = useAdmin();
  const counts = useData<Record<string, number>>(
    '/v1/admin/requests/counts',
    !!me && can(me.role, 'requests'),
    30000,
  );
  const n = counts.data?.new ?? 0;
  return n ? (
    <span className={className} aria-label={t('newCount', { n })}>
      {n > 99 ? '99+' : n}
    </span>
  ) : null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { me, t, locale, setLocale, request, clear, report } = useAdmin(),
    { navigate } = useGuard();
  if (!me) return null;
  return (
    <Menu
      align={compact ? 'end' : 'start'}
      label={t('accountMenu')}
      triggerClass={compact ? 'avatar-btn' : 'account-trigger'}
      trigger={
        <>
          <span className="avatar" aria-hidden>
            {initials(me.name)}
          </span>
          {!compact && (
            <span className="account-text">
              <span className="account-name">{me.name}</span>
              <span className="account-role">{t(me.role)}</span>
            </span>
          )}
          <span className="sr-only">{t('accountMenu')}</span>
        </>
      }
      items={[
        { label: t('account'), onSelect: () => void navigate('/account') },
        'separator',
        ...locales.map((code) => ({
          label: languageNames[code],
          checked: locale === code,
          onSelect: () => setLocale(code),
        })),
        'separator',
        {
          label: t('logout'),
          onSelect: async () => {
            try {
              await request('/v1/admin/auth/logout', 'POST', {});
              clear();
            } catch (error) {
              report(error);
            }
          },
        },
      ]}
    />
  );
}

export function AppShell({
  path,
  title,
  children,
}: {
  path: string;
  title: string;
  children: ReactNode;
}) {
  const { t } = useAdmin(),
    groups = useNav(),
    current = activeNav(path),
    flat = groups.flatMap((group) => group.items),
    bottom = ['overview', 'requests', 'trips', 'media']
      .map((id) => flat.find((item) => item.id === id))
      .filter(Boolean) as Omit<NavItem, 'label'>[],
    inBottom = bottom.some((item) => item.id === current);
  return (
    <div className="shell">
      <a className="skip" href="#main">
        {t('skip')}
      </a>
      <aside className="sidebar" aria-label={t('mainNav')}>
        <AppLink href="/" className="sidebar-logo" aria-label={t('overview')}>
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
        </AppLink>
        <nav className="sidebar-nav">
          {groups.map((group, index) => (
            <div key={index} className="nav-group">
              {group.label && (
                <p className="nav-group-label">{t(group.label)}</p>
              )}
              <ul>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <AppLink
                        href={item.href}
                        className="nav-link"
                        aria-current={current === item.id ? 'page' : undefined}
                        title={t(item.id)}
                      >
                        <Icon size={20} aria-hidden />
                        <span className="nav-text">{t(item.id)}</span>
                        {item.id === 'requests' && <NewRequestsBadge />}
                      </AppLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-account">
          <AccountMenu />
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <AppLink href="/" className="topbar-logo" aria-label={t('overview')}>
            <img src="/brand/mark.webp" alt="" width={117} height={112} />
          </AppLink>
          <p className="topbar-title" aria-hidden>
            {title}
          </p>
          <AccountMenu compact />
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <nav className="bottom-nav" aria-label={t('mainNav')}>
        {bottom.map((item) => {
          const Icon = item.icon;
          return (
            <AppLink
              key={item.id}
              href={item.href}
              className="bottom-link"
              aria-current={current === item.id ? 'page' : undefined}
            >
              <span className="bottom-icon">
                <Icon size={22} aria-hidden />
                {item.id === 'requests' && (
                  <NewRequestsBadge className="bottom-badge" />
                )}
              </span>
              <span>{t(item.id)}</span>
            </AppLink>
          );
        })}
        <AppLink
          href="/more"
          className="bottom-link"
          aria-current={!inBottom ? 'page' : undefined}
        >
          <span className="bottom-icon">
            <Grid2X2 size={22} aria-hidden />
          </span>
          <span>{t('more')}</span>
        </AppLink>
      </nav>
    </div>
  );
}

/** Mobile "More": everything, grouped like the sidebar. */
export function MorePage() {
  const { t } = useAdmin(),
    groups = useNav();
  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>{t('more')}</h1>
        </div>
      </header>
      {groups.map((group, index) => (
        <section key={index} className="more-group">
          {group.label && <h2 className="nav-group-label">{t(group.label)}</h2>}
          <ul className="more-list">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <AppLink href={item.href} className="more-link">
                    <Icon size={20} aria-hidden />
                    <span>{t(item.id)}</span>
                    {item.id === 'requests' && <NewRequestsBadge />}
                    <ChevronRight size={18} aria-hidden className="chev" />
                  </AppLink>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section className="more-group">
        <ul className="more-list">
          <li>
            <AppLink href="/account" className="more-link">
              <Users size={20} aria-hidden />
              <span>{t('account')}</span>
              <ChevronRight size={18} aria-hidden className="chev" />
            </AppLink>
          </li>
        </ul>
      </section>
    </div>
  );
}
