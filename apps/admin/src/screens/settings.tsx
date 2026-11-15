'use client';
import { useMemo, useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { can } from '@stella/shared/admin';
import type { Locale } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { obj, rows, type Row } from '../lib/content';
import { loc, locOut, markReviewed, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { EditorLayout } from '../components/ui/editor';
import { FormField, I18nField } from '../components/ui/field';
import { SortableList } from '../components/ui/sortable';
import { useConfirm } from '../components/ui/dialog';
import { Callout, LoadError } from '../components/ui/states';

const platforms = [
  'Instagram',
  'Facebook',
  'TikTok',
  'YouTube',
  'TripAdvisor',
  'Website',
] as const;
const phoneRe = /^\+[1-9]\d{6,14}$/;

type Social = { key: string; platform: string; url: string };
type SettingsState = {
  contact: {
    whatsappPrimary: string;
    whatsappSecondary: string;
    phone: string;
    email: string;
  };
  business: { address: Loc; hours: Loc; legal: Loc };
  booking: {
    minDays: string;
    maxAdults: string;
    maxChildren: string;
    pickup: string[];
  };
  social: { items: Social[] };
};

export function SettingsScreen() {
  const { t, write } = useAdmin(),
    query = useData<Row>('/v1/admin/settings');
  const initial = useMemo<SettingsState | null>(() => {
    if (!query.data) return null;
    const d = query.data,
      c = obj(d.contacts),
      r = obj(d.request_rules);
    return {
      contact: {
        whatsappPrimary: String(c.whatsapp_primary ?? ''),
        whatsappSecondary: String(c.whatsapp_secondary ?? ''),
        phone: String(c.phone ?? ''),
        email: String(c.email ?? ''),
      },
      business: {
        address: loc(d.address),
        hours: loc(d.hours),
        legal: loc(d.legal_entity),
      },
      booking: {
        minDays: String(r.min_days_ahead ?? 0),
        maxAdults: String(r.max_adults ?? 20),
        maxChildren: String(r.max_children ?? 10),
        pickup: Array.isArray(d.pickup_areas)
          ? (d.pickup_areas as string[])
          : [],
      },
      social: {
        items: rows(d.social).map((s, i) => ({
          key: 's' + i,
          platform:
            platforms.find(
              (p) => p.toLowerCase() === String(s.label).toLowerCase(),
            ) ?? String(s.label || 'Website'),
          url: String(s.url ?? ''),
        })),
      },
    };
  }, [query.data]);
  const labels = {
    contact: t('contact'),
    business: t('businessDetails'),
    booking: t('bookingRules'),
    social: t('social'),
  };
  const put = async (body: unknown) =>
    (await write('/v1/admin/settings', 'PUT', body)).revisions;
  const editor = useEditor<SettingsState>({
    id: 'settings',
    initial,
    sourceKey: String(query.dataUpdatedAt),
    order: ['contact', 'business', 'booking', 'social'],
    labels,
    success: t('settingsSaved'),
    afterSave: () => query.refetch(),
    validate: {
      contact: (v) =>
        !phoneRe.test(v.whatsappPrimary)
          ? t('phoneFormat')
          : v.whatsappSecondary && !phoneRe.test(v.whatsappSecondary)
            ? t('phoneFormat')
            : v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)
              ? t('emailFormat')
              : null,
      business: (v) =>
        !(v.address.raw.en ?? '').trim() || !(v.legal.raw.en ?? '').trim()
          ? t('requiredEnglish')
          : null,
      booking: (v) =>
        !(Number(v.minDays) >= 0 && Number(v.minDays) <= 30) ||
        !(Number(v.maxAdults) >= 1) ||
        !(Number(v.maxChildren) >= 0)
          ? t('rulesInvalid')
          : null,
      social: (v) =>
        v.items.some((s) => !/^https:\/\/\S+\.\S+/.test(s.url))
          ? t('urlHttps')
          : null,
    },
    savers: {
      contact: (v) =>
        put({
          contacts: {
            whatsapp_primary: v.whatsappPrimary,
            whatsapp_secondary: v.whatsappSecondary || null,
            phone: v.phone.trim() || null,
            email: v.email.trim() || null,
          },
        }),
      business: (v) =>
        put({
          address: locOut(v.address),
          hours: locOut(v.hours),
          legal_entity: locOut(v.legal),
        }),
      booking: (v) =>
        put({
          request_rules: {
            min_days_ahead: Number(v.minDays),
            max_adults: Number(v.maxAdults),
            max_children: Number(v.maxChildren),
          },
          pickup_areas: v.pickup,
        }),
      social: (v) =>
        put({
          social: v.items.map((s) => ({
            label: s.platform,
            url: s.url.trim(),
          })),
        }),
    },
  });
  if (query.isError)
    return (
      <div className="page">
        <LoadError retry={() => void query.refetch()} />
      </div>
    );
  const v = editor.values;
  const num = (
    value: string,
    set: (v: string) => void,
    props: { id: string },
    min: number,
    max: number,
  ) => (
    <input
      {...props}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => set(e.target.value)}
    />
  );
  return (
    <EditorLayout
      back={{ href: '/', label: t('overview') }}
      title={t('settings')}
      loading={!v}
      editor={editor as never}
      onMarkReviewed={(code: Locale) =>
        v && editor.replaceAll(markReviewed(v, code))
      }
      sections={
        v
          ? [
              {
                id: 'contact',
                label: labels.contact,
                content: (
                  <>
                    <FormField
                      label={t('whatsappMain')}
                      hint={t('whatsappMainHint')}
                    >
                      {(p) => (
                        <input
                          {...p}
                          type="tel"
                          inputMode="tel"
                          value={v.contact.whatsappPrimary}
                          onChange={(e) =>
                            editor.set('contact', {
                              ...v.contact,
                              whatsappPrimary: e.target.value.replace(
                                /\s/g,
                                '',
                              ),
                            })
                          }
                        />
                      )}
                    </FormField>
                    <FormField
                      label={t('whatsappSecond')}
                      hint={t('whatsappSecondHint')}
                    >
                      {(p) => (
                        <input
                          {...p}
                          type="tel"
                          inputMode="tel"
                          value={v.contact.whatsappSecondary}
                          onChange={(e) =>
                            editor.set('contact', {
                              ...v.contact,
                              whatsappSecondary: e.target.value.replace(
                                /\s/g,
                                '',
                              ),
                            })
                          }
                        />
                      )}
                    </FormField>
                    <FormField
                      label={t('phone')}
                      aside={
                        !v.contact.phone ? (
                          <span className="warn-chip">
                            <AlertTriangle size={14} aria-hidden />
                            {t('missing')}
                          </span>
                        ) : undefined
                      }
                    >
                      {(p) => (
                        <input
                          {...p}
                          type="tel"
                          value={v.contact.phone}
                          maxLength={40}
                          onChange={(e) =>
                            editor.set('contact', {
                              ...v.contact,
                              phone: e.target.value,
                            })
                          }
                        />
                      )}
                    </FormField>
                    <FormField
                      label={t('email')}
                      aside={
                        !v.contact.email ? (
                          <span className="warn-chip">
                            <AlertTriangle size={14} aria-hidden />
                            {t('missing')}
                          </span>
                        ) : undefined
                      }
                    >
                      {(p) => (
                        <input
                          {...p}
                          type="email"
                          value={v.contact.email}
                          maxLength={254}
                          onChange={(e) =>
                            editor.set('contact', {
                              ...v.contact,
                              email: e.target.value,
                            })
                          }
                        />
                      )}
                    </FormField>
                  </>
                ),
              },
              {
                id: 'business',
                label: labels.business,
                content: (
                  <>
                    <I18nField
                      label={t('officeAddress')}
                      required
                      multiline
                      value={v.business.address}
                      showErrors={editor.showErrors}
                      onChange={(address) =>
                        editor.set('business', { ...v.business, address })
                      }
                    />
                    <I18nField
                      label={t('openingHours')}
                      multiline
                      value={v.business.hours}
                      showErrors={editor.showErrors}
                      onChange={(hours) =>
                        editor.set('business', { ...v.business, hours })
                      }
                    />
                    <I18nField
                      label={t('legalName')}
                      required
                      value={v.business.legal}
                      showErrors={editor.showErrors}
                      onChange={(legal) =>
                        editor.set('business', { ...v.business, legal })
                      }
                    />
                  </>
                ),
              },
              {
                id: 'booking',
                label: labels.booking,
                content: (
                  <>
                    <div className="field-row-3">
                      <FormField
                        label={t('minNotice')}
                        hint={t('minNoticeHint')}
                      >
                        {(p) =>
                          num(
                            v.booking.minDays,
                            (minDays) =>
                              editor.set('booking', { ...v.booking, minDays }),
                            p,
                            0,
                            30,
                          )
                        }
                      </FormField>
                      <FormField label={t('maxAdults')}>
                        {(p) =>
                          num(
                            v.booking.maxAdults,
                            (maxAdults) =>
                              editor.set('booking', {
                                ...v.booking,
                                maxAdults,
                              }),
                            p,
                            1,
                            60,
                          )
                        }
                      </FormField>
                      <FormField label={t('maxChildren')}>
                        {(p) =>
                          num(
                            v.booking.maxChildren,
                            (maxChildren) =>
                              editor.set('booking', {
                                ...v.booking,
                                maxChildren,
                              }),
                            p,
                            0,
                            40,
                          )
                        }
                      </FormField>
                    </div>
                    <PickupAreas
                      items={v.booking.pickup}
                      onChange={(pickup) =>
                        editor.set('booking', { ...v.booking, pickup })
                      }
                    />
                  </>
                ),
              },
              {
                id: 'social',
                label: labels.social,
                content: (
                  <>
                    {!v.social.items.length && (
                      <p className="muted">{t('noSocialYet')}</p>
                    )}
                    <SortableList
                      items={v.social.items}
                      getKey={(s) => s.key}
                      itemName={(s) => s.platform}
                      onChange={(items) => editor.set('social', { items })}
                      onRemove={(index) =>
                        editor.set('social', {
                          items: v.social.items.filter((_, i) => i !== index),
                        })
                      }
                      render={(s, index) => (
                        <div className="social-row">
                          <FormField label={t('platform')}>
                            {(p) => (
                              <select
                                {...p}
                                value={s.platform}
                                onChange={(e) =>
                                  editor.set('social', {
                                    items: v.social.items.map((x, i) =>
                                      i === index
                                        ? { ...x, platform: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              >
                                {[...new Set([...platforms, s.platform])].map(
                                  (name) => (
                                    <option key={name} value={name}>
                                      {name === 'Website' ? t('website') : name}
                                    </option>
                                  ),
                                )}
                              </select>
                            )}
                          </FormField>
                          <FormField label={t('url')}>
                            {(p) => (
                              <input
                                {...p}
                                type="url"
                                placeholder="https://"
                                value={s.url}
                                onChange={(e) =>
                                  editor.set('social', {
                                    items: v.social.items.map((x, i) =>
                                      i === index
                                        ? { ...x, url: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            )}
                          </FormField>
                        </div>
                      )}
                    />
                    {v.social.items.length < 10 && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          editor.set('social', {
                            items: [
                              ...v.social.items,
                              {
                                key: 'n' + Date.now(),
                                platform: 'Instagram',
                                url: '',
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={18} aria-hidden />
                        {t('addSocial')}
                      </button>
                    )}
                  </>
                ),
              },
              {
                id: 'privacy',
                label: t('customerDataRequests'),
                content: <PrivacyTools />,
              },
            ]
          : []
      }
    />
  );
}

function PickupAreas({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const { t } = useAdmin(),
    [value, setValue] = useState('');
  const add = () => {
    const v = value.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setValue('');
  };
  return (
    <div className="field">
      <div className="field-label">
        <span className="label-text">{t('pickupAreas')}</span>
      </div>
      <SortableList
        items={items}
        getKey={(s) => s}
        itemName={(s) => s}
        onChange={onChange}
        onRemove={(index) => onChange(items.filter((_, i) => i !== index))}
        render={(s) => <span>{s}</span>}
      />
      <div className="inline-add">
        <FormField label={t('addPickupArea')}>
          {(p) => (
            <input
              {...p}
              value={value}
              maxLength={100}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
          )}
        </FormField>
        <button type="button" className="btn" onClick={add}>
          <Plus size={18} aria-hidden />
          {t('add')}
        </button>
      </div>
    </div>
  );
}

function PrivacyTools() {
  const { t, tp, me, request, report, notify } = useAdmin(),
    confirm = useConfirm(),
    [phone, setPhone] = useState(''),
    [busy, setBusy] = useState(false),
    valid = /^\+[1-9]\d{7,14}$/.test(phone),
    matches = useData<Row[]>(
      '/v1/admin/requests?q=' + encodeURIComponent(phone),
      valid && can(me!.role, 'requests'),
    );
  if (!can(me!.role, 'export'))
    return <p className="muted">{t('forbidden')}</p>;
  const found = matches.data?.filter((r) => r.phone === phone).length;
  return (
    <>
      <Callout tone="warning">{t('eraseWarning')}</Callout>
      <FormField label={t('customerPhone')} hint={t('customerPhoneHint')}>
        {(p) => (
          <span className="field-with-icon">
            <input
              {...p}
              type="tel"
              inputMode="tel"
              placeholder="+20…"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\s/g, ''))}
            />
            {valid && found !== undefined && (
              <span className="muted small">{tp('requestsFound', found)}</span>
            )}
          </span>
        )}
      </FormField>
      <div className="inline-actions">
        <button
          type="button"
          className="btn"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await request(
                '/v1/admin/privacy/requests/export',
                'POST',
                { phone },
              );
              const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json',
                  }),
                ),
                a = document.createElement('a');
              a.href = url;
              a.download = 'customer-export.json';
              a.click();
              URL.revokeObjectURL(url);
              notify(t('exportReady'));
            } catch (error) {
              report(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('exportCustomerData')}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={!valid || busy}
          onClick={async () => {
            if (
              !(await confirm({
                title: t('eraseTitle', { phone }),
                body: t('eraseBody'),
                details:
                  found !== undefined
                    ? [tp('requestsFound', found)]
                    : undefined,
                confirmLabel: t('erase'),
                tone: 'danger',
                requireText: 'ERASE',
              }))
            )
              return;
            setBusy(true);
            try {
              const result = await request<{ erased: number }>(
                '/v1/admin/privacy/requests/erase',
                'POST',
                { phone, confirm: true },
              );
              notify(tp('erasedN', Number(result.erased ?? 0)));
              setPhone('');
            } catch (error) {
              report(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('eraseCustomerData')}
        </button>
      </div>
    </>
  );
}
