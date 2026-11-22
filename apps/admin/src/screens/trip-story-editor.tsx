'use client';

import { useState } from 'react';
import { locales, type Locale } from '@stella/shared';
import type { Story } from '@stella/shared/story';
import { useAdmin } from '../lib/admin-context';
import { MediaSlot } from '../components/ui/media-picker';
import { SortableList } from '../components/ui/sortable';

export function TripStoryEditor({
  value,
  onChange,
}: {
  value: Story | null;
  onChange: (story: Story | null) => void;
}) {
  const { t, locale } = useAdmin(),
    [lang, setLang] = useState<Locale>(locale),
    [selected, setSelected] = useState('');
  const scenes = value?.scenes ?? [],
    scene = scenes.find((s) => s.id === selected) ?? scenes[0];
  const [mediaKind, setMediaKind] = useState<'image' | 'video'>('image');
  function update(patch: Partial<Story['scenes'][number]>) {
    if (scene)
      onChange({
        scenes: scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)),
      });
  }
  return (
    <div className="field">
      <button
        type="button"
        className="btn"
        disabled={scenes.length >= 40}
        onClick={() => {
          const id = crypto.randomUUID();
          const last = scenes.at(-1)?.route.at(-1) ?? [34.32786, 27.91367];
          onChange({
            scenes: [
              ...scenes,
              {
                id,
                route: [last],
                transport: 'road',
                kind: 'passage',
                frame: 'cover',
                mediaId: null,
                title: { en: '' },
                caption: { en: '' },
                credit: '',
              },
            ],
          });
          setSelected(id);
        }}
      >
        {t('storyAdd')}
      </button>
      <SortableList
        items={scenes}
        getKey={(s) => s.id}
        itemName={(s) => s.title[lang] || s.id}
        render={(s) => (
          <button
            type="button"
            aria-pressed={scene?.id === s.id}
            onClick={() => setSelected(s.id)}
          >
            {s.title[lang] || s.id}
          </button>
        )}
        onChange={(scenes) => onChange({ scenes })}
        onRemove={(index) => {
          const remaining = scenes.filter((_, i) => i !== index);
          onChange(remaining.length ? { scenes: remaining } : null);
        }}
      />
      {scene && (
        <>
          <label>
            {t('storyLanguage')}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Locale)}
            >
              {locales.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            {t('title')}
            <input
              value={scene.title[lang] ?? ''}
              onChange={(e) =>
                update({ title: { ...scene.title, [lang]: e.target.value } })
              }
            />
          </label>
          <label>
            {t('description')}
            <textarea
              value={scene.caption[lang] ?? ''}
              onChange={(e) =>
                update({
                  caption: { ...scene.caption, [lang]: e.target.value },
                })
              }
            />
          </label>
          <label>
            {t('storyCategory')}
            <select
              value={scene.kind}
              onChange={(e) =>
                update({ kind: e.target.value as typeof scene.kind })
              }
            >
              {(
                ['included', 'passage', 'illustrative', 'optional'] as const
              ).map((k) => (
                <option key={k} value={k}>
                  {t('story_' + k)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('media')}
            <select
              value={mediaKind}
              onChange={(e) =>
                setMediaKind(e.target.value as 'image' | 'video')
              }
            >
              <option value="image">{t('image')}</option>
              <option value="video">{t('video')}</option>
            </select>
          </label>
          <MediaSlot
            kind={mediaKind}
            label={t('media')}
            mediaId={scene.mediaId}
            onChange={(mediaId) => {
              update({ mediaId, credit: '' });
            }}
          />
          <label>
            {t('storyCredit')}
            <input
              value={scene.credit}
              onChange={(e) => update({ credit: e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={scene.frame === 'contain'}
              onChange={(e) =>
                update({ frame: e.target.checked ? 'contain' : 'cover' })
              }
            />
            {t('storyFrame')}
          </label>
          {(['focalX', 'focalY'] as const).map((key) => (
            <label key={key}>
              {t(key === 'focalX' ? 'storyFocalX' : 'storyFocalY')}
              <input
                type="range"
                min="0"
                max="100"
                value={scene[key] ?? 50}
                onChange={(e) => update({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          {([0, 1] as const).map((axis) => (
            <label key={axis}>
              {t(axis === 0 ? 'storyLongitude' : 'storyLatitude')}
              <input
                key={scene.id}
                type="number"
                step="any"
                min={axis === 0 ? -180 : -85}
                max={axis === 0 ? 180 : 85}
                defaultValue={scene.route.at(-1)?.[axis]}
                onBlur={(e) => {
                  if (!e.target.validity.valid || !e.target.value) return;
                  const point: [number, number] = [...scene.route.at(-1)!];
                  point[axis] = Number(e.target.value);
                  update({ route: [...scene.route.slice(0, -1), point] });
                }}
              />
            </label>
          ))}
        </>
      )}
    </div>
  );
}
