'use client';
import { useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { can } from '@stella/shared/admin';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { loc, locOut, markReviewed, same, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { useMediaMap } from '../lib/catalog';
import { EditorLayout } from '../components/ui/editor';
import { I18nField } from '../components/ui/field';
import { SortableList } from '../components/ui/sortable';
import { MediaThumb } from '../components/ui/media-picker';
import { Callout, LoadError } from '../components/ui/states';
import { StatusBadge, contentStatus } from '../components/ui/status';
import { PerksList, type Perk } from './collections';
import { TripPickDialog } from './packages';

type Step = { key: string; title: Loc; text: Loc };
type HomeState = {
  private: { heading: Loc; text: Loc; perks: Perk[]; slugs: string[] };
  featured: { slugs: string[] };
  build: { heading: Loc; text: Loc };
  how: { steps: Step[] };
  contact: { heading: Loc; text: Loc };
};

function build(value: Record<string, unknown>): HomeState {
  const home = obj(value.home);
  return {
    private: {
      heading: loc(home.private_heading),
      text: loc(home.private_text),
      perks: rows(value.private_perks).map((p, i) => ({
        key: 'perk' + i,
        title: loc(p.title),
        sub: loc(p.sub),
      })),
      slugs: Array.isArray(home.private_trip_slugs)
        ? (home.private_trip_slugs as string[])
        : [],
    },
    featured: {
      slugs: Array.isArray(home.featured_trip_slugs)
        ? (home.featured_trip_slugs as string[])
        : [],
    },
    build: { heading: loc(home.build_heading), text: loc(home.build_text) },
    how: {
      steps: rows(value.how_steps).map((s, i) => ({
        key: 'step' + i,
        title: loc(s.title),
        text: loc(s.text),
      })),
    },
    contact: {
      heading: loc(home.contact_heading),
      text: loc(home.contact_text),
    },
  };
}

function payload(
  v: HomeState,
  base: Record<string, unknown>,
  publish: boolean,
) {
  const home = obj(base.home);
  return {
    home: {
      private_heading: locOut(v.private.heading),
      private_text: locOut(v.private.text),
      build_heading: locOut(v.build.heading),
      build_text: locOut(v.build.text),
      contact_heading: locOut(v.contact.heading),
      contact_text: locOut(v.contact.text),
      private_trip_slugs: v.private.slugs,
      ...(v.featured.slugs.length || Array.isArray(home.featured_trip_slugs)
        ? { featured_trip_slugs: v.featured.slugs }
        : {}),
    },
    how_steps: v.how.steps.map((s) => ({
      title: locOut(s.title),
      text: locOut(s.text),
    })),
    private_perks: v.private.perks.map((p) => ({
      title: locOut(p.title),
      sub: locOut(p.sub),
    })),
    publish,
  };
}

export function Homepage() {
  const { t, me, write, save, webOrigin, locale } = useAdmin(),
    query = useData<Row>('/v1/admin/homepage'),
    canPublish = can(me!.role, 'publish'),
    publishing = useRef(false),
    [busy, setBusy] = useState(false);
  const draft = query.data?.draft ? obj(query.data.draft) : null;
  const live = query.data
    ? {
        home: query.data.home,
        how_steps: query.data.how_steps,
        private_perks: query.data.private_perks,
      }
    : null;
  const source = (draft ?? live) as Record<string, unknown> | null;
  const initial = useMemo(
    () => (source ? build(source) : null),
    [query.dataUpdatedAt],
  );
  const labels = {
    private: t('homePrivate'),
    featured: t('homeFeatured'),
    build: t('homeBuild'),
    how: t('homeHow'),
    contact: t('homeContact'),
  };
  const editor = useEditor<HomeState>({
    id: 'homepage',
    initial,
    sourceKey: String(query.dataUpdatedAt),
    order: ['private', 'featured', 'build', 'how', 'contact'],
    labels,
    success: () =>
      t(publishing.current ? 'homepagePublished' : 'homepageDraftSaved'),
    afterSave: () => query.refetch(),
    validate: {
      private: (v) =>
        !(v.heading.raw.en ?? '').trim() || !(v.text.raw.en ?? '').trim()
          ? t('requiredEnglish')
          : v.perks.length !== 4
            ? t('perksExactly4')
            : null,
      build: (v) =>
        !(v.heading.raw.en ?? '').trim() || !(v.text.raw.en ?? '').trim()
          ? t('requiredEnglish')
          : null,
      contact: (v) =>
        !(v.heading.raw.en ?? '').trim() || !(v.text.raw.en ?? '').trim()
          ? t('requiredEnglish')
          : null,
      how: (v) => (v.steps.length !== 3 ? t('stepsExactly3') : null),
      featured: (v) => (v.slugs.length > 12 ? t('featuredMax12') : null),
    },
    saveAll: async (values) =>
      (
        await write(
          '/v1/admin/homepage',
          'PUT',
          payload(values, source!, publishing.current),
        )
      ).revisions,
  });
  if (query.isError)
    return (
      <div className="page">
        <LoadError retry={() => void query.refetch()} />
      </div>
    );
  const v = editor.values;
  const differs = !!draft && !!live && !same(build(draft), build(live));
  // Which sections the saved draft changes compared with the live homepage.
  const changedSections =
    draft && live
      ? (() => {
          const a = build(draft),
            b = build(live);
          return (Object.keys(labels) as (keyof typeof labels)[])
            .filter((key) => !same(a[key], b[key]))
            .map((key) => labels[key]);
        })()
      : [];
  const run = async (publish: boolean) => {
    publishing.current = publish;
    setBusy(true);
    try {
      if (editor.dirty.length) await editor.save();
      else if (publish && v) {
        await save('/v1/admin/homepage', 'PUT', payload(v, source!, true), {
          success: t('homepagePublished'),
        });
        await query.refetch();
      }
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  };
  return (
    <EditorLayout
      back={{ href: '/', label: t('overview') }}
      title={t('homepage')}
      loading={!v}
      editor={editor as never}
      onMarkReviewed={(code) => v && editor.replaceAll(markReviewed(v, code))}
      actions={
        <a
          className="btn"
          href={webOrigin + '/' + locale}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} aria-hidden />
          {t('viewLiveSite')}
        </a>
      }
      status={
        draft ? (
          <span className="badge-status amber">
            <span className="dot" aria-hidden />
            {t('draftDiffers')}
          </span>
        ) : undefined
      }
      banner={
        draft && differs ? (
          <Callout tone="info">
            {canPublish ? t('draftPendingPublish') : t('draftPendingManager')}
            {changedSections.length > 0 && (
              <>
                {' '}
                <strong>{t('whatChanged')}</strong> {changedSections.join(', ')}
                .
              </>
            )}
          </Callout>
        ) : undefined
      }
      saveActions={
        editor.dirty.length || (draft && canPublish) ? (
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
                id: 'private',
                label: labels.private,
                content: (
                  <>
                    <I18nField
                      label={t('headline')}
                      required
                      value={v.private.heading}
                      onChange={(heading) =>
                        editor.set('private', { ...v.private, heading })
                      }
                    />
                    <I18nField
                      label={t('supportingText')}
                      required
                      multiline
                      value={v.private.text}
                      onChange={(text) =>
                        editor.set('private', { ...v.private, text })
                      }
                    />
                    <h3 className="sub-h">{t('perks')}</h3>
                    <PerksList
                      items={v.private.perks}
                      max={4}
                      fixed
                      onChange={(perks) =>
                        editor.set('private', { ...v.private, perks })
                      }
                      showErrors={editor.showErrors}
                    />
                    <h3 className="sub-h">{t('tripsShown')}</h3>
                    <TripSlugs
                      slugs={v.private.slugs}
                      onChange={(slugs) =>
                        editor.set('private', { ...v.private, slugs })
                      }
                      filter={(r) =>
                        r.format !== 'group' && r.status === 'published'
                      }
                      hint={t('privateTripsHint')}
                    />
                  </>
                ),
              },
              {
                id: 'featured',
                label: labels.featured,
                description: t('featuredHint'),
                content: (
                  <TripSlugs
                    slugs={v.featured.slugs}
                    max={4}
                    onChange={(slugs) => editor.set('featured', { slugs })}
                    filter={(r) => r.status === 'published'}
                  />
                ),
              },
              {
                id: 'build',
                label: labels.build,
                content: (
                  <>
                    <I18nField
                      label={t('headline')}
                      required
                      value={v.build.heading}
                      onChange={(heading) =>
                        editor.set('build', { ...v.build, heading })
                      }
                    />
                    <I18nField
                      label={t('supportingText')}
                      required
                      multiline
                      value={v.build.text}
                      onChange={(text) =>
                        editor.set('build', { ...v.build, text })
                      }
                    />
                  </>
                ),
              },
              {
                id: 'how',
                label: labels.how,
                description: t('howHint'),
                content: (
                  <SortableList
                    items={v.how.steps}
                    getKey={(s) => s.key}
                    itemName={(s, i) =>
                      content(s.title.raw, locale) || t('stepN', { n: i + 1 })
                    }
                    onChange={(steps) => editor.set('how', { steps })}
                    render={(s, index) => (
                      <div className="perk-row">
                        <I18nField
                          label={t('stepTitle')}
                          required
                          value={s.title}
                          showErrors={editor.showErrors}
                          onChange={(title) =>
                            editor.set('how', {
                              steps: v.how.steps.map((x, i) =>
                                i === index ? { ...x, title } : x,
                              ),
                            })
                          }
                        />
                        <I18nField
                          label={t('stepText')}
                          required
                          multiline
                          value={s.text}
                          showErrors={editor.showErrors}
                          onChange={(text) =>
                            editor.set('how', {
                              steps: v.how.steps.map((x, i) =>
                                i === index ? { ...x, text } : x,
                              ),
                            })
                          }
                        />
                      </div>
                    )}
                  />
                ),
              },
              {
                id: 'contact',
                label: labels.contact,
                content: (
                  <>
                    <I18nField
                      label={t('headline')}
                      required
                      value={v.contact.heading}
                      onChange={(heading) =>
                        editor.set('contact', { ...v.contact, heading })
                      }
                    />
                    <I18nField
                      label={t('supportingText')}
                      required
                      multiline
                      value={v.contact.text}
                      onChange={(text) =>
                        editor.set('contact', { ...v.contact, text })
                      }
                    />
                  </>
                ),
              },
            ]
          : []
      }
    />
  );
}

function TripSlugs({
  slugs,
  onChange,
  filter,
  max,
  hint,
}: {
  slugs: string[];
  onChange: (slugs: string[]) => void;
  filter: (row: Row) => boolean;
  max?: number;
  hint?: string;
}) {
  const { t, locale } = useAdmin(),
    trips = useData<Row[]>('/v1/admin/trips'),
    media = useMediaMap(),
    [picking, setPicking] = useState(false);
  const bySlug = new Map((trips.data ?? []).map((r) => [String(r.slug), r]));
  return (
    <>
      {hint && <p className="field-hint">{hint}</p>}
      {!slugs.length && <p className="muted">{t('noTripsChosen')}</p>}
      <SortableList
        items={slugs}
        getKey={(s) => s}
        itemName={(s) => content(bySlug.get(s)?.title, locale) || s}
        onChange={onChange}
        onRemove={(index) => onChange(slugs.filter((_, i) => i !== index))}
        render={(s) => {
          const r = bySlug.get(s);
          return (
            <div className="gallery-row">
              <MediaThumb
                media={media.get(String(r?.coverMediaId))}
                size={44}
              />
              <span className="truncate">{content(r?.title, locale) || s}</span>
              {r && <StatusBadge status={contentStatus(r)} />}
            </div>
          );
        }}
      />
      {(!max || slugs.length < max) && (
        <button type="button" className="btn" onClick={() => setPicking(true)}>
          <Plus size={18} aria-hidden />
          {t('addTrip')}
        </button>
      )}
      {picking && (
        <TripPickDialog
          trips={(trips.data ?? []).filter(
            (r) => r.kind === 'trip' && filter(r),
          )}
          exclude={slugs.map((s) => bySlug.get(s)?.id ?? '')}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            const r = (trips.data ?? []).find((x) => x.id === id);
            if (r) onChange([...slugs, String(r.slug)]);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
