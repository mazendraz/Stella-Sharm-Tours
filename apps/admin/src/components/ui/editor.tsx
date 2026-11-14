'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCheck } from 'lucide-react';
import { locales, type Locale } from '@stella/shared';
import { useAdmin } from '../../lib/admin-context';
import { useGuard } from '../../lib/guard';
import { localeSummary } from '../../lib/loc';
import { languageName } from '../../lib/format';
import { LangContext } from './field';
import { AppLink } from './link';
import { Menu, type MenuItem } from './menu';
import { useConfirm } from './dialog';
import { Skeleton } from './states';

export type EditorSection = {
  id: string;
  label: string;
  content: ReactNode;
  hidden?: boolean;
  description?: ReactNode;
};
type EditorLike = {
  dirty: string[];
  errors: Record<string, string | undefined>;
  labels: Record<string, string>;
  saving: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
  values: unknown;
};

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title + ' · Stella Admin';
  }, [title]);
}

/** Full-page editor: header, section nav, one language bar, one save bar. */
export function EditorLayout({
  back,
  title,
  status,
  actions,
  menu,
  editor,
  sections,
  i18n = true,
  onMarkReviewed,
  banner,
  saveActions,
  loading,
}: {
  back: { href: string; label: string };
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  menu?: MenuItem[];
  editor: EditorLike;
  sections: EditorSection[];
  i18n?: boolean;
  onMarkReviewed?: (locale: Locale) => void;
  banner?: ReactNode;
  saveActions?: ReactNode;
  loading?: boolean;
}) {
  const { t } = useAdmin(),
    { dirty, errors, labels } = editor,
    confirm = useConfirm(),
    [lang, setLang] = useState<Locale>('en'),
    [active, setActive] = useState(sections[0]?.id ?? ''),
    visible = sections.filter((section) => !section.hidden),
    saveRef = useRef(editor.save);
  saveRef.current = editor.save;
  usePageTitle(title);
  // Ctrl/Cmd+S saves; Esc does nothing in full-page editors.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Scroll-spy for the section nav.
  useEffect(() => {
    if (loading) return;
    const nodes = visible
      .map((section) => document.getElementById('section-' + section.id))
      .filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (top) setActive(top.target.id.replace('section-', ''));
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [loading, visible.map((s) => s.id).join()]);
  const summary = i18n ? localeSummary(editor.values) : null;
  const dirtyLabels = dirty.map((key) => labels[key] ?? key);
  return (
    <LangContext.Provider value={lang}>
      <div className="editor">
        <header className="editor-head">
          <AppLink href={back.href} className="back-link">
            <ArrowLeft size={18} aria-hidden />
            {back.label}
          </AppLink>
          <div className="editor-title-row">
            <h1 className="editor-title">{title}</h1>
            <div className="editor-actions">
              {actions}
              {status}
              {menu && menu.length > 0 && <Menu items={menu} />}
            </div>
          </div>
        </header>
        {summary && (
          <LanguageBar
            lang={lang}
            setLang={setLang}
            summary={summary}
            onMarkReviewed={onMarkReviewed}
          />
        )}
        {loading ? (
          <Skeleton variant="editor" rows={4} />
        ) : (
          <div className="editor-body">
            <nav className="section-nav" aria-label={t('sections')}>
              <ul>
                {visible.map((section) => {
                  const isDirty = dirty.includes(section.id),
                    hasError = !!errors[section.id];
                  return (
                    <li key={section.id}>
                      <a
                        href={'#section-' + section.id}
                        aria-current={
                          active === section.id ? 'true' : undefined
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          document
                            .getElementById('section-' + section.id)
                            ?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          setActive(section.id);
                        }}
                      >
                        {section.label}
                        {hasError ? (
                          <span
                            className="nav-dot error"
                            aria-label={t('hasErrors')}
                          />
                        ) : isDirty ? (
                          <span
                            className="nav-dot"
                            aria-label={t('unsavedShort')}
                          />
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="editor-content">
              {banner}
              {visible.map((section) => (
                <section
                  key={section.id}
                  id={'section-' + section.id}
                  className="editor-section"
                  aria-labelledby={'heading-' + section.id}
                >
                  <h2 id={'heading-' + section.id}>{section.label}</h2>
                  {section.description && (
                    <p className="muted section-desc">{section.description}</p>
                  )}
                  {errors[section.id] && (
                    <p className="section-error" role="alert">
                      {errors[section.id]}
                    </p>
                  )}
                  {section.content}
                </section>
              ))}
            </div>
          </div>
        )}
        {(dirty.length > 0 || saveActions) && (
          <div className="save-bar" role="region" aria-label={t('saveBar')}>
            <p className="save-bar-text">
              {dirty.length
                ? t('unsavedIn', { sections: dirtyLabels.join(', ') })
                : ''}
            </p>
            <div className="save-bar-actions">
              {dirty.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  disabled={editor.saving}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t('discardTitle'),
                        body: t('discardBody', {
                          sections: dirtyLabels.join(', '),
                        }),
                        confirmLabel: t('discard'),
                        tone: 'danger',
                      })
                    )
                      editor.discard();
                  }}
                >
                  {t('discard')}
                </button>
              )}
              {saveActions ?? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={editor.saving || !dirty.length}
                  onClick={() => void editor.save()}
                >
                  {editor.saving && <span className="spinner" aria-hidden />}
                  {t('save')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </LangContext.Provider>
  );
}

function LanguageBar({
  lang,
  setLang,
  summary,
  onMarkReviewed,
}: {
  lang: Locale;
  setLang: (locale: Locale) => void;
  summary: ReturnType<typeof localeSummary>;
  onMarkReviewed?: ((locale: Locale) => void) | undefined;
}) {
  const { t, locale } = useAdmin();
  const current = summary[lang],
    needsReview = lang !== 'en' && current.machine + current.stale > 0;
  return (
    <div
      className="language-bar"
      role="group"
      aria-label={t('editingLanguage')}
    >
      <div className="lang-chips">
        {locales.map((code) => {
          const s = summary[code],
            tone = s.missing ? 'red' : s.machine || s.stale ? 'amber' : 'green',
            parts = [
              s.missing ? t('nMissing', { n: s.missing }) : '',
              s.machine ? t('nMachine', { n: s.machine }) : '',
              s.stale ? t('nStale', { n: s.stale }) : '',
            ].filter(Boolean);
          const tip =
            languageName(code, locale) +
            ': ' +
            (parts.length ? parts.join(', ') : t('allReviewed'));
          return (
            <button
              key={code}
              type="button"
              className="lang-chip"
              aria-pressed={lang === code}
              title={tip}
              onClick={() => setLang(code)}
            >
              <span className={'lang-dot ' + tone} aria-hidden />
              {code.toUpperCase()}
              <span className="sr-only"> — {tip}</span>
            </button>
          );
        })}
      </div>
      {needsReview && onMarkReviewed && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onMarkReviewed(lang)}
        >
          <CheckCheck size={16} aria-hidden />
          {t('markReviewed', { lang: languageName(lang, locale) })}
        </button>
      )}
    </div>
  );
}

/** Small helper for "dirty/unsaved" guard on non-editor pages. */
export function useLeaveGuard() {
  return useGuard();
}
