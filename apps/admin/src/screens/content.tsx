'use client';
import './seo.css';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { locales, type Locale } from '@stella/shared';
import { can } from '@stella/shared/admin';
import {
  contentKinds,
  parseBody,
  type ContentKind,
} from '@stella/shared/content';
import { useAdmin, useData } from '../lib/admin-context';
import { PageHeader } from '../components/ui/page-header';
import { EmptyState, LoadError, Skeleton } from '../components/ui/states';
import { FormField, Segmented } from '../components/ui/field';
import { AppLink } from '../components/ui/link';
import { useGuard } from '../lib/guard';
import { MediaSlot } from '../components/ui/media-picker';

type L = Partial<Record<Locale, string>>;
type Listed = {
  id: string;
  slug: string;
  kind: ContentKind;
  category: string | null;
  title: L;
  status: 'draft' | 'published';
  blockers: string[];
};
type Page = {
  id: string;
  slug: string;
  kind: ContentKind;
  category: string | null;
  title: L;
  summary: L | null;
  body: L | null;
  seoTitle: L | null;
  seoDescription: L | null;
  authorName: string | null;
  authorRole: string | null;
  sources: { title: string; url: string }[];
  faqs: { q: L; a: L }[];
  coverMediaId: string | null;
  relatedTrips: string[];
  relatedPages: string[];
  sort: number;
  status: 'draft' | 'published';
};
const emptyPage = (): Omit<Page, 'id' | 'status'> => ({
  slug: '',
  kind: 'guide',
  category: null,
  title: {},
  summary: null,
  body: null,
  seoTitle: null,
  seoDescription: null,
  authorName: null,
  authorRole: null,
  sources: [],
  faqs: [],
  coverMediaId: null,
  relatedTrips: [],
  relatedPages: [],
  sort: 0,
});
/** Drop empty languages; null when English is missing (API requires en). */
const out = (l: L | null) => {
  const v = Object.fromEntries(
    Object.entries(l ?? {}).filter(([, x]) => x && x.trim()),
  );
  return v.en ? v : null;
};

export function ContentPages({ id }: { id?: string }) {
  return id ? <ContentEditor key={id} id={id} /> : <ContentList />;
}

function ContentList() {
  const { t, locale } = useAdmin(),
    query = useData<Listed[]>('/v1/admin/content-pages');
  return (
    <div className="page seo-page">
      <PageHeader
        title={t('travelContent')}
        description={t('contentPagesIntro')}
        secondary={
          <AppLink className="btn btn-primary" href="/content/new">
            {t('contentNew')}
          </AppLink>
        }
      />
      {query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton rows={4} />
      ) : !query.data.length ? (
        <EmptyState title={t('contentNone')} body={t('contentNoneBody')} />
      ) : (
        <ul className="simple-list">
          {query.data.map((p) => (
            <li key={p.id}>
              <AppLink href={'/content/' + p.id} className="simple-row">
                <span className="simple-main">
                  <span className="strong">
                    {p.title[locale] || p.title.en}
                  </span>
                  <span className="muted">
                    {t('contentKind_' + p.kind)} · /{p.slug}
                    {p.blockers.length > 0 &&
                      ' · ' +
                        t('contentBlockedCount', { n: p.blockers.length })}
                  </span>
                </span>
                <span
                  className={
                    'badge-status ' +
                    (p.status === 'published' ? 'green' : 'amber')
                  }
                >
                  <span className="dot" aria-hidden="true" />
                  {t(
                    p.status === 'published'
                      ? 'contentPublished'
                      : 'contentDraft',
                  )}
                </span>
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContentEditor({ id }: { id: string }) {
  const isNew = id === 'new';
  const { t, me, request, save, report } = useAdmin(),
    { navigate } = useGuard();
  const client = useQueryClient(),
    query = useData<{ page: Page; blockers: string[] }>(
      '/v1/admin/content-pages/' + id,
      !isNew,
    ),
    trips =
      useData<{ slug: string; title: L; status: string }[]>('/v1/admin/trips'),
    [lang, setLang] = useState<Locale>('en'),
    [v, setV] = useState<Omit<Page, 'id' | 'status'> | null>(
      isNew ? emptyPage() : null,
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.data && !v) {
      const { id: _id, status: _status, ...rest } = query.data.page;
      setV(rest);
    }
  }, [query.data, v]);
  if (!isNew && query.isError)
    return (
      <div className="page">
        <LoadError retry={() => void query.refetch()} />
      </div>
    );
  if (!v)
    return (
      <div className="page">
        <Skeleton variant="editor" />
      </div>
    );
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) =>
    setV({ ...v, [key]: value });
  const setLoc = (
    key: 'title' | 'summary' | 'body' | 'seoTitle' | 'seoDescription',
    text: string,
  ) => set(key, { ...(v[key] ?? {}), [lang]: text });
  const payload = () => ({
    slug: v.slug.trim(),
    kind: v.kind,
    category: v.category?.trim() || null,
    title: out(v.title) ?? { en: '' },
    summary: out(v.summary),
    body: out(v.body),
    seoTitle: out(v.seoTitle),
    seoDescription: out(v.seoDescription),
    authorName: v.authorName?.trim() || null,
    authorRole: v.authorRole?.trim() || null,
    sources: v.sources.filter((s) => s.title.trim() && s.url.trim()),
    faqs: v.faqs
      .map((f) => ({ q: out(f.q), a: out(f.a) }))
      .filter(
        (
          f,
        ): f is {
          q: Record<string, string> & { en: string };
          a: Record<string, string> & { en: string };
        } => Boolean(f.q && f.a),
      ),
    coverMediaId: v.coverMediaId,
    relatedTrips: v.relatedTrips,
    relatedPages: v.relatedPages,
    sort: v.sort,
  });
  const store = async () => {
    setBusy(true);
    try {
      if (isNew) {
        const created = await request<{ id: string }>(
          '/v1/admin/content-pages',
          'POST',
          payload(),
        );
        await client.invalidateQueries({
          queryKey: ['/v1/admin/content-pages'],
        });
        void navigate('/content/' + created.id);
      } else {
        await save('/v1/admin/content-pages/' + id, 'PUT', payload(), {
          success: t('contentSaved'),
          undo: false,
        });
        await client.invalidateQueries({
          queryKey: ['/v1/admin/content-pages/' + id],
        });
        await client.invalidateQueries({
          queryKey: ['/v1/admin/content-pages'],
        });
      }
    } catch (error) {
      report(error, t('contentSaveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: 'publish' | 'unpublish' | 'archive') => {
    setBusy(true);
    try {
      await request('/v1/admin/content-pages/' + id + '/' + action, 'POST', {});
      await client.invalidateQueries({ queryKey: ['/v1/admin/content-pages'] });
      if (action === 'archive') void navigate('/content');
      else
        await client.invalidateQueries({
          queryKey: ['/v1/admin/content-pages/' + id],
        });
    } catch (error) {
      // The readiness list below is re-read so it shows the current blockers.
      await query.refetch();
      report(error, t('contentPublishBlocked'));
    } finally {
      setBusy(false);
    }
  };
  const status = query.data?.page.status ?? 'draft',
    blockers = query.data?.blockers ?? [],
    mayPublish = me ? can(me.role, 'publish') : false,
    // Saving a live page changes the site; editors ask an owner/manager.
    locked = status === 'published' && !mayPublish,
    preview = parseBody(v.body?.[lang] ?? '');
  return (
    <div className="page seo-page">
      <AppLink href="/content" className="back-link">
        {t('contentAll')}
      </AppLink>
      <PageHeader
        title={v.title[lang] || v.title.en || t('contentNew')}
        description={t(
          status === 'published' ? 'contentPublished' : 'contentDraft',
        )}
      />
      {!isNew && (
        <section className="panel" aria-labelledby="content-ready-h">
          <div className="panel-head">
            <h2 id="content-ready-h">{t('contentReadiness')}</h2>
          </div>
          {blockers.length ? (
            <ul>
              {blockers.map((b) => (
                <li key={b}>{t('contentBlocker_' + b)}</li>
              ))}
            </ul>
          ) : (
            <p>{t('contentReady')}</p>
          )}
          {mayPublish && (
            <div className="dialog-actions">
              {status === 'published' ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void act('unpublish')}
                >
                  {t('contentUnpublish')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || blockers.length > 0}
                    onClick={() => void act('publish')}
                  >
                    {t('contentPublish')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void act('archive')}
                  >
                    {t('contentArchive')}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}
      <section className="panel" aria-labelledby="content-basics-h">
        <div className="panel-head">
          <h2 id="content-basics-h">{t('contentBasics')}</h2>
        </div>
        <FormField label={t('contentSlug')} hint={t('contentSlugHint')}>
          {(p) => (
            <input
              {...p}
              value={v.slug}
              pattern="[a-z0-9-]+"
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
            />
          )}
        </FormField>
        <Segmented
          label={t('contentKind')}
          value={v.kind}
          onChange={(k) => set('kind', k)}
          options={contentKinds.map((k) => ({
            value: k,
            label: t('contentKind_' + k),
          }))}
        />
        <FormField label={t('contentCategory')}>
          {(p) => (
            <input
              {...p}
              value={v.category ?? ''}
              onChange={(e) => set('category', e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('contentAuthor')} hint={t('contentAuthorHint')}>
          {(p) => (
            <input
              {...p}
              value={v.authorName ?? ''}
              onChange={(e) => set('authorName', e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('contentAuthorRole')}>
          {(p) => (
            <input
              {...p}
              value={v.authorRole ?? ''}
              onChange={(e) => set('authorRole', e.target.value)}
            />
          )}
        </FormField>
        <MediaSlot
          label={t('contentCover')}
          hint={t('contentCoverHint')}
          kind="image"
          mediaId={v.coverMediaId}
          onChange={(mediaId) => set('coverMediaId', mediaId)}
        />
      </section>

      <section className="panel" aria-labelledby="content-text-h">
        <div className="panel-head">
          <h2 id="content-text-h">{t('contentText')}</h2>
        </div>
        <Segmented
          label={t('language')}
          value={lang}
          onChange={setLang}
          options={locales.map((l) => ({
            value: l,
            label:
              l.toUpperCase() +
              (v.title[l]?.trim() && v.body?.[l]?.trim() ? '' : ' •'),
          }))}
        />
        <p className="muted">{t('contentLangHint')}</p>
        <FormField label={t('contentTitle')}>
          {(p) => (
            <input
              {...p}
              lang={lang}
              value={v.title[lang] ?? ''}
              onChange={(e) => setLoc('title', e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('contentSummary')}>
          {(p) => (
            <textarea
              {...p}
              lang={lang}
              rows={2}
              value={v.summary?.[lang] ?? ''}
              onChange={(e) => setLoc('summary', e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('contentBody')} hint={t('contentBodyHint')}>
          {(p) => (
            <textarea
              {...p}
              lang={lang}
              rows={14}
              value={v.body?.[lang] ?? ''}
              onChange={(e) => setLoc('body', e.target.value)}
            />
          )}
        </FormField>
        {/* Scrolls once the text is long: reachable by keyboard (WCAG 2.1.1). */}
        <section
          className="content-preview"
          aria-labelledby="content-preview-h"
          lang={lang}
          tabIndex={0}
        >
          <h3 id="content-preview-h">{t('contentPreview')}</h3>
          {preview.length ? (
            preview.map((block, i) =>
              block.type === 'heading' ? (
                <h4 key={i}>{block.text}</h4>
              ) : block.type === 'list' ? (
                <ul key={i}>
                  {block.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={i}>{block.text}</p>
              ),
            )
          ) : (
            <p className="muted">{t('contentPreviewEmpty')}</p>
          )}
        </section>
        <FormField label={t('seoTitleField')} hint={t('seoTitleHint')}>
          {(p) => (
            <input
              {...p}
              lang={lang}
              maxLength={70}
              value={v.seoTitle?.[lang] ?? ''}
              onChange={(e) => setLoc('seoTitle', e.target.value)}
            />
          )}
        </FormField>
        <FormField
          label={t('seoDescriptionField')}
          hint={t('seoDescriptionHint')}
        >
          {(p) => (
            <textarea
              {...p}
              lang={lang}
              rows={2}
              maxLength={170}
              value={v.seoDescription?.[lang] ?? ''}
              onChange={(e) => setLoc('seoDescription', e.target.value)}
            />
          )}
        </FormField>
      </section>

      <section className="panel" aria-labelledby="content-faq-h">
        <div className="panel-head">
          <h2 id="content-faq-h">{t('contentFaqs')}</h2>
          <button
            type="button"
            className="btn"
            onClick={() => set('faqs', [...v.faqs, { q: {}, a: {} }])}
          >
            {t('contentAddFaq')}
          </button>
        </div>
        {v.faqs.map((f, i) => (
          <fieldset key={i} className="seo-fieldset">
            <legend>
              {t('contentFaqN', { n: i + 1 })} ({lang.toUpperCase()})
            </legend>
            <FormField label={t('contentQuestion')}>
              {(p) => (
                <input
                  {...p}
                  lang={lang}
                  value={f.q[lang] ?? ''}
                  onChange={(e) =>
                    set(
                      'faqs',
                      v.faqs.map((x, j) =>
                        j === i
                          ? { ...x, q: { ...x.q, [lang]: e.target.value } }
                          : x,
                      ),
                    )
                  }
                />
              )}
            </FormField>
            <FormField label={t('contentAnswer')}>
              {(p) => (
                <textarea
                  {...p}
                  lang={lang}
                  rows={3}
                  value={f.a[lang] ?? ''}
                  onChange={(e) =>
                    set(
                      'faqs',
                      v.faqs.map((x, j) =>
                        j === i
                          ? { ...x, a: { ...x.a, [lang]: e.target.value } }
                          : x,
                      ),
                    )
                  }
                />
              )}
            </FormField>
            <button
              type="button"
              className="btn"
              onClick={() =>
                set(
                  'faqs',
                  v.faqs.filter((_, j) => j !== i),
                )
              }
            >
              {t('contentRemove')}
            </button>
          </fieldset>
        ))}
      </section>

      <section className="panel" aria-labelledby="content-links-h">
        <div className="panel-head">
          <h2 id="content-links-h">{t('contentLinks')}</h2>
        </div>
        <fieldset className="seo-fieldset">
          <legend>{t('contentRelatedTrips')}</legend>
          <ul className="seo-checks">
            {(trips.data ?? []).map((trip) => (
              <li key={trip.slug}>
                <label>
                  <input
                    type="checkbox"
                    checked={v.relatedTrips.includes(trip.slug)}
                    onChange={(e) =>
                      set(
                        'relatedTrips',
                        e.target.checked
                          ? [...v.relatedTrips, trip.slug].slice(0, 12)
                          : v.relatedTrips.filter((s) => s !== trip.slug),
                      )
                    }
                  />{' '}
                  {trip.title.en}
                  {trip.status !== 'published' &&
                    ' (' + t('contentDraft') + ')'}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <FormField
          label={t('contentRelatedPages')}
          hint={t('contentRelatedPagesHint')}
        >
          {(p) => (
            <input
              {...p}
              value={v.relatedPages.join(', ')}
              onChange={(e) =>
                set(
                  'relatedPages',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          )}
        </FormField>
        <fieldset className="seo-fieldset">
          <legend>{t('contentSources')}</legend>
          {v.sources.map((s, i) => (
            <div key={i} className="seo-source">
              <FormField label={t('contentSourceTitle')}>
                {(p) => (
                  <input
                    {...p}
                    value={s.title}
                    onChange={(e) =>
                      set(
                        'sources',
                        v.sources.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x,
                        ),
                      )
                    }
                  />
                )}
              </FormField>
              <FormField label={t('contentSourceUrl')}>
                {(p) => (
                  <input
                    {...p}
                    type="url"
                    value={s.url}
                    onChange={(e) =>
                      set(
                        'sources',
                        v.sources.map((x, j) =>
                          j === i ? { ...x, url: e.target.value } : x,
                        ),
                      )
                    }
                  />
                )}
              </FormField>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  set(
                    'sources',
                    v.sources.filter((_, j) => j !== i),
                  )
                }
              >
                {t('contentRemove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              set('sources', [...v.sources, { title: '', url: 'https://' }])
            }
          >
            {t('contentAddSource')}
          </button>
        </fieldset>
      </section>
      {locked && <p className="muted">{t('contentLockedPublished')}</p>}
      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || locked || !v.slug || !v.title.en}
          onClick={() => void store()}
        >
          {t('contentSave')}
        </button>
      </div>
    </div>
  );
}
