'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { can } from '@stella/shared/admin';
import { locales, type Locale } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, type Row } from '../lib/content';
import { loc, locOut, markReviewed, locProblems, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { relative, languageName } from '../lib/format';
import { PageHeader } from '../components/ui/page-header';
import { DataTable, type Column } from '../components/ui/data-table';
import { StatusBadge } from '../components/ui/status';
import { EditorLayout, usePageTitle } from '../components/ui/editor';
import { I18nField, LangContext, Toggle } from '../components/ui/field';
import { SortableList } from '../components/ui/sortable';
import { Modal, useConfirm } from '../components/ui/dialog';
import {
  Callout,
  EmptyState,
  LoadError,
  Skeleton,
} from '../components/ui/states';
import { AppLink } from '../components/ui/link';
import type { MenuItem } from '../components/ui/menu';
import { HistorySection } from '../components/history';

const staticPages = ['contact', 'terms', 'privacy', 'cancellation'] as const;

function pageState(blocks: Row[] | undefined) {
  if (!blocks) return null;
  if (!blocks.length) return 'empty';
  if (blocks.some((b) => b.status === 'draft'))
    return blocks.some((b) => b.status === 'published') ? 'changes' : 'draft';
  return 'published';
}

export function PagesIndex() {
  const { t, tp, locale, request } = useAdmin(),
    faqs = useData<Row[]>('/v1/admin/faqs');
  const blocks = useQueries({
    queries: staticPages.map((key) => ({
      queryKey: ['/v1/admin/pages/' + key + '/blocks'],
      queryFn: () => request<Row[]>('/v1/admin/pages/' + key + '/blocks'),
    })),
  });
  usePageTitle(t('pages'));
  const data: Row[] = [
    {
      id: 'faq',
      name: t('faq'),
      meta: faqs.data ? tp('questionsCount', faqs.data.length) : '',
      state: faqs.data ? (faqs.data.length ? 'published' : 'empty') : null,
      updated: null,
    },
    ...staticPages.map((key, i) => {
      const list = blocks[i]?.data;
      const latest = list
        ?.map((b) => String(b.updatedAt ?? ''))
        .sort()
        .at(-1);
      return {
        id: key,
        name: t('page_' + key),
        meta: list
          ? tp(
              'blocksCount',
              list.filter(
                (b) =>
                  b.status ===
                  (list.some((x) => x.status === 'draft')
                    ? 'draft'
                    : 'published'),
              ).length,
            )
          : '',
        state: pageState(list),
        updated: latest || null,
      };
    }),
  ];
  const badge = (row: Row) =>
    row.state === 'empty' ? (
      <span className="badge-status red">
        <span className="dot" aria-hidden />
        {t('empty')}
      </span>
    ) : row.state === 'changes' ? (
      <span className="badge-status amber">
        <span className="dot" aria-hidden />
        {t('unpublishedChanges')}
      </span>
    ) : row.state ? (
      <StatusBadge status={String(row.state)} />
    ) : null;
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('page'),
      cell: (row) => <span className="strong">{String(row.name)}</span>,
    },
    {
      key: 'meta',
      header: t('content'),
      className: 'hide-md',
      cell: (row) => String(row.meta),
    },
    { key: 'status', header: t('status'), cell: badge },
    {
      key: 'updated',
      header: t('updated'),
      className: 'hide-md muted',
      cell: (row) =>
        row.updated ? relative(String(row.updated), locale) : '—',
    },
  ];
  return (
    <div className="page">
      <PageHeader title={t('pages')} description={t('pagesDesc')} />
      <DataTable
        caption={t('pages')}
        columns={columns}
        rows={data}
        getKey={(row) => row.id}
        href={(row) => '/pages/' + row.id}
        mobile={{
          title: (row) => String(row.name),
          meta: (row) => String(row.meta),
          badge,
        }}
        loading={faqs.isPending}
        empty={{ title: t('pages') }}
      />
    </div>
  );
}

type Block = { key: string; id?: string; heading: Loc; text: Loc };
type PageEditState = { page: { title: Loc }; blocks: { items: Block[] } };

export function StaticPageEditor({ pageKey }: { pageKey: string }) {
  const { t, me, write, save, locale } = useAdmin(),
    valid = (staticPages as readonly string[]).includes(pageKey),
    query = useData<Row[]>(`/v1/admin/pages/${pageKey}/blocks`, valid),
    publishing = useRef(false),
    [busy, setBusy] = useState(false),
    canPublish = can(me!.role, 'publish');
  const blocks = useMemo(() => {
    const list = query.data ?? [];
    const drafts = list.filter((b) => b.status === 'draft');
    return (drafts.length ? drafts : list).sort(
      (a, b) => Number(a.sort) - Number(b.sort),
    );
  }, [query.data]);
  const initial = useMemo<PageEditState | null>(() => {
    if (!query.data) return null;
    return {
      page: { title: loc(obj(blocks[0]?.data).title) },
      blocks: {
        items: blocks.map((b) => ({
          key: String(b.id),
          id: String(b.id),
          heading: loc(obj(b.data).heading),
          text: loc(obj(b.data).text),
        })),
      },
    };
  }, [query.dataUpdatedAt]);
  const state = pageState(query.data);
  const labels = { page: t('pageTitle'), blocks: t('content') };
  const editor = useEditor<PageEditState>({
    id: 'page-' + pageKey,
    initial,
    sourceKey: String(query.dataUpdatedAt),
    order: ['page', 'blocks'],
    labels,
    success: () => t(publishing.current ? 'pagePublished' : 'pageDraftSaved'),
    afterSave: () => query.refetch(),
    validate: {
      page: (v) => (!(v.title.raw.en ?? '').trim() ? t('titleRequired') : null),
      blocks: (v) =>
        !v.items.length
          ? t('pageNeedsBlock')
          : v.items.some((b) => !(b.text.raw.en ?? '').trim())
            ? t('blockNeedsText')
            : null,
    },
    saveAll: async (v) =>
      (
        await write('/v1/admin/pages/' + pageKey + '/blocks', 'PUT', {
          publish: publishing.current,
          blocks: v.blocks.items.map((b, sort) => ({
            ...(b.id ? { id: b.id } : {}),
            type: 'rich_text',
            sort,
            data: {
              ...(sort === 0 && locOut(v.page.title)
                ? { title: locOut(v.page.title) }
                : {}),
              ...(locOut(b.heading) ? { heading: locOut(b.heading) } : {}),
              text: locOut(b.text),
            },
          })),
        })
      ).revisions,
  });
  if (!valid)
    return (
      <div className="page">
        <EmptyState title={t('notFoundTitle')} body={t('notFoundBody')} />
      </div>
    );
  if (query.isError)
    return (
      <div className="page">
        <LoadError retry={() => void query.refetch()} />
      </div>
    );
  const v = editor.values;
  const run = async (publish: boolean) => {
    publishing.current = publish;
    setBusy(true);
    try {
      if (editor.dirty.length) await editor.save();
      else if (publish && v) {
        await save(
          '/v1/admin/pages/' + pageKey + '/blocks',
          'PUT',
          {
            publish: true,
            blocks: v.blocks.items.map((b, sort) => ({
              ...(b.id ? { id: b.id } : {}),
              type: 'rich_text',
              sort,
              data: {
                ...(sort === 0 && locOut(v.page.title)
                  ? { title: locOut(v.page.title) }
                  : {}),
                ...(locOut(b.heading) ? { heading: locOut(b.heading) } : {}),
                text: locOut(b.text),
              },
            })),
          },
          { success: t('pagePublished') },
        );
        await query.refetch();
      }
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  };
  return (
    <EditorLayout
      back={{ href: '/pages', label: t('pages') }}
      title={t('page_' + pageKey)}
      loading={!v}
      editor={editor as never}
      onMarkReviewed={(code: Locale) =>
        v && editor.replaceAll(markReviewed(v, code))
      }
      status={
        state === 'empty' ? (
          <span className="badge-status red">
            <span className="dot" aria-hidden />
            {t('empty')}
          </span>
        ) : state === 'changes' ? (
          <span className="badge-status amber">
            <span className="dot" aria-hidden />
            {t('unpublishedChanges')}
          </span>
        ) : state ? (
          <StatusBadge status={state} />
        ) : undefined
      }
      banner={
        state === 'changes' || state === 'draft' ? (
          <Callout tone="info">
            {canPublish ? t('pageDraftNote') : t('draftPendingManager')}
          </Callout>
        ) : undefined
      }
      saveActions={
        editor.dirty.length ||
        ((state === 'changes' || state === 'draft') && canPublish) ? (
          <>
            {editor.dirty.length > 0 && (
              <button
                type="button"
                className="btn"
                disabled={busy || editor.saving}
                onClick={() => void run(false)}
              >
                {t('saveDraft')}
              </button>
            )}
            {canPublish && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || editor.saving}
                onClick={() => void run(true)}
              >
                {(busy || editor.saving) && (
                  <span className="spinner" aria-hidden />
                )}
                {t('publishChanges')}
              </button>
            )}
          </>
        ) : undefined
      }
      sections={
        v
          ? [
              {
                id: 'page',
                label: labels.page,
                content: (
                  <I18nField
                    label={t('pageTitle')}
                    required
                    value={v.page.title}
                    showErrors={editor.showErrors}
                    onChange={(title) => editor.set('page', { title })}
                  />
                ),
              },
              {
                id: 'blocks',
                label: labels.blocks,
                description: t('blocksHint'),
                content: (
                  <>
                    {!v.blocks.items.length && (
                      <p className="muted">{t('noBlocksYet')}</p>
                    )}
                    <SortableList
                      items={v.blocks.items}
                      getKey={(b) => b.key}
                      itemName={(b, i) =>
                        content(b.heading.raw, locale) ||
                        t('blockN', { n: i + 1 })
                      }
                      onChange={(items) => editor.set('blocks', { items })}
                      onRemove={(index) =>
                        editor.set('blocks', {
                          items: v.blocks.items.filter((_, i) => i !== index),
                        })
                      }
                      render={(b, index) => (
                        <div className="perk-row">
                          <I18nField
                            label={t('blockHeading')}
                            hint={t('optional')}
                            value={b.heading}
                            showErrors={editor.showErrors}
                            onChange={(heading) =>
                              editor.set('blocks', {
                                items: v.blocks.items.map((x, i) =>
                                  i === index ? { ...x, heading } : x,
                                ),
                              })
                            }
                          />
                          <I18nField
                            label={t('text')}
                            required
                            multiline
                            value={b.text}
                            showErrors={editor.showErrors}
                            onChange={(text) =>
                              editor.set('blocks', {
                                items: v.blocks.items.map((x, i) =>
                                  i === index ? { ...x, text } : x,
                                ),
                              })
                            }
                          />
                        </div>
                      )}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        editor.set('blocks', {
                          items: [
                            ...v.blocks.items,
                            {
                              key: 'n' + Date.now(),
                              heading: loc(null),
                              text: loc(null),
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={18} aria-hidden />
                      {t('addBlock')}
                    </button>
                  </>
                ),
              },
            ]
          : []
      }
    />
  );
}

export function FaqEditor() {
  const { t, tp, locale, me, write, save, notify, report } = useAdmin(),
    query = useData<Row[]>('/v1/admin/faqs'),
    confirm = useConfirm(),
    [editing, setEditing] = useState<Row | 'new' | null>(null),
    [order, setOrder] = useState<string[] | null>(null),
    canPublish = can(me!.role, 'publish');
  usePageTitle(t('faq'));
  useEffect(() => setOrder(null), [query.data]);
  const all = useMemo(() => {
    const base = query.data ?? [];
    if (!order) return base;
    const byId = new Map(base.map((r) => [r.id, r]));
    return order.map((id) => byId.get(id)!).filter(Boolean);
  }, [query.data, order]);
  const body = (
    row: Row,
    sort: number,
    publish = row.status === 'published',
  ) => ({
    q: row.q,
    a: row.a,
    sort,
    publish,
  });
  const persistOrder = async (ids: string[]) => {
    setOrder(ids);
    const byId = new Map((query.data ?? []).map((r) => [r.id, r]));
    const revisions: string[] = [];
    try {
      for (const [index, id] of ids.entries()) {
        const row = byId.get(id)!;
        if (Number(row.sort) === index * 10) continue;
        revisions.push(
          ...(
            await write('/v1/admin/faqs/' + id, 'PATCH', body(row, index * 10))
          ).revisions,
        );
      }
      await query.refetch();
      notify(t('orderUpdated'), { undo: revisions });
    } catch (error) {
      report(error);
      await query.refetch();
    }
  };
  const columns: Column<Row>[] = [
    {
      key: 'q',
      header: t('question'),
      cell: (row) => <span className="strong">{content(row.q, locale)}</span>,
    },
    {
      key: 'status',
      header: t('status'),
      cell: (row) => (
        <StatusBadge
          status={row.status === 'published' ? 'published' : 'draft'}
        />
      ),
    },
  ];
  const menu = (row: Row): MenuItem[] => {
    const name = content(row.q, locale),
      items: MenuItem[] = [
        { label: t('edit'), onSelect: () => setEditing(row) },
      ];
    if (!canPublish) return items;
    items.push(
      row.status === 'published'
        ? {
            label: t('unpublish'),
            onSelect: async () => {
              if (
                await confirm({
                  title: t('unpublishTitle', { name }),
                  body: t('unpublishBody'),
                  confirmLabel: t('unpublish'),
                })
              )
                await save(
                  '/v1/admin/faqs/' + row.id,
                  'PATCH',
                  body(row, Number(row.sort), false),
                  { success: t('questionUnpublished') },
                ).catch(() => {});
            },
          }
        : {
            label: t('publish'),
            onSelect: async () => {
              if (
                await confirm({
                  title: t('publishTitle', { name }),
                  body: t('publishBody'),
                  confirmLabel: t('publish'),
                })
              )
                await save(
                  '/v1/admin/faqs/' + row.id,
                  'PATCH',
                  body(row, Number(row.sort), true),
                  { success: t('questionPublished') },
                ).catch(() => {});
            },
          },
      'separator',
      {
        label: t('archive'),
        tone: 'danger',
        onSelect: async () => {
          if (
            await confirm({
              title: t('archiveTitle', { name }),
              body: t('archiveBody'),
              confirmLabel: t('archive'),
              tone: 'danger',
            })
          )
            await save(
              '/v1/admin/faqs/' + row.id + '/archive',
              'POST',
              {},
              { success: t('questionArchived') },
            ).catch(() => {});
        },
      },
    );
    return items;
  };
  return (
    <div className="page">
      <AppLink href="/pages" className="back-link">
        ← {t('pages')}
      </AppLink>
      <PageHeader
        title={t('faq')}
        description={t('faqDesc')}
        primary={{ label: t('addQuestion'), onClick: () => setEditing('new') }}
      />
      <DataTable
        caption={t('faq')}
        columns={columns}
        rows={all}
        getKey={(row) => row.id}
        mobile={{
          title: (row) => content(row.q, locale),
          badge: (row) => (
            <StatusBadge
              status={row.status === 'published' ? 'published' : 'draft'}
            />
          ),
        }}
        menu={menu}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        empty={{ title: t('noQuestionsYet'), body: t('noQuestionsYetBody') }}
        count={tp('questionsCount', all.length)}
        reorder={{
          enabled: true,
          itemName: (row) => content(row.q, locale),
          onReorder: (_, ids) => void persistOrder(ids),
        }}
      />
      {query.isPending && <Skeleton rows={1} />}
      {editing && (
        <FaqDialog
          row={editing === 'new' ? null : editing}
          nextSort={(all.length + 1) * 10}
          canPublish={canPublish}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FaqDialog({
  row,
  nextSort,
  canPublish,
  onClose,
}: {
  row: Row | null;
  nextSort: number;
  canPublish: boolean;
  onClose: () => void;
}) {
  const { t, save, report, locale } = useAdmin(),
    confirm = useConfirm(),
    [lang, setLang] = useState<Locale>('en'),
    [q, setQ] = useState(() => loc(row?.q)),
    [a, setA] = useState(() => loc(row?.a)),
    [published, setPublished] = useState(
      row ? row.status === 'published' : false,
    ),
    [showErrors, setShowErrors] = useState(false),
    [busy, setBusy] = useState(false);
  const dirty =
    JSON.stringify([q.raw, a.raw, published]) !==
    JSON.stringify([
      loc(row?.q).raw,
      loc(row?.a).raw,
      row ? row.status === 'published' : false,
    ]);
  const close = async () => {
    if (
      !dirty ||
      (await confirm({
        title: t('discardTitle'),
        body: t('discardDialogBody'),
        confirmLabel: t('discard'),
        tone: 'danger',
      }))
    )
      onClose();
  };
  return (
    <Modal
      title={row ? t('editQuestion') : t('addQuestion')}
      onClose={() => void close()}
      size="lg"
    >
      <LangContext.Provider value={lang}>
        <div
          className="lang-chips"
          role="group"
          aria-label={t('editingLanguage')}
        >
          {locales.map((code) => (
            <button
              key={code}
              type="button"
              className="lang-chip"
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            setShowErrors(true);
            const problems = [locProblems(q, true), locProblems(a, true)];
            if (problems.some((p) => p.missing.length || p.stale.length)) {
              const langs = [
                ...new Set(problems.flatMap((p) => [...p.missing, ...p.stale])),
              ];
              setLang(langs[0]!);
              return;
            }
            setBusy(true);
            try {
              await save(
                '/v1/admin/faqs' + (row ? '/' + row.id : ''),
                row ? 'PATCH' : 'POST',
                {
                  q: locOut(q),
                  a: locOut(a),
                  sort: row ? Number(row.sort) : nextSort,
                  publish: published,
                },
                { success: t(row ? 'questionSaved' : 'questionAdded') },
              );
              onClose();
            } catch (error) {
              report(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <I18nField
            label={t('question')}
            required
            value={q}
            onChange={setQ}
            showErrors={showErrors}
          />
          <I18nField
            label={t('answer')}
            required
            multiline
            value={a}
            onChange={setA}
            showErrors={showErrors}
          />
          {canPublish && (
            <Toggle
              checked={published}
              onChange={setPublished}
              label={t('publishedOnSite')}
            />
          )}
          {row && (
            <details className="advanced">
              <summary>{t('history')}</summary>
              <HistorySection entities={['faq']} id={row.id} />
            </details>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => void close()}>
              {t('cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || (!!row && !dirty)}
            >
              {busy && <span className="spinner" aria-hidden />}
              {row ? t('save') : t('addQuestion')}
            </button>
          </div>
        </form>
      </LangContext.Provider>
      <span className="sr-only">{languageName(lang, locale)}</span>
    </Modal>
  );
}
