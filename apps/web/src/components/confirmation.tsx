'use client';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import {
  confirmationSchema,
  type Confirmation as ConfirmationType,
} from '@stella/shared/booking';
import {
  requestSummarySchema,
  type RequestSummary,
} from '@/lib/request-summary';
import { RequestSummaryCard } from './request-summary';
export function Confirmation({ reference }: { reference: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [data, setData] = useState<ConfirmationType | null>(null);
  const [summary, setSummary] = useState<RequestSummary | null>(null);
  useEffect(() => {
    try {
      const raw = JSON.parse(
        sessionStorage.getItem('stella.confirmation.' + reference) ?? 'null',
      );
      if (raw?.expires > Date.now()) {
        const parsed = confirmationSchema.safeParse(raw);
        if (parsed.success) setData(parsed.data);
        const sent = requestSummarySchema.safeParse(raw.summary);
        if (sent.success) setSummary(sent.data);
      } else sessionStorage.removeItem('stella.confirmation.' + reference);
    } catch {}
  }, [reference]);
  return (
    <main className="wrap confirmation-page confirmation" id="main">
      {data ? (
        <span className="confirmation-badge" aria-hidden="true">
          <Check size={26} strokeWidth={2.4} />
        </span>
      ) : (
        <p className="kicker">
          <bdi>{reference}</bdi>
        </p>
      )}
      <h1>{t(data ? 'sent' : 'request')}</h1>
      <p>{t(data ? 'sentSub' : 'confirmationMissing')}</p>
      {data && (
        <>
          {summary ? (
            <RequestSummaryCard reference={reference} summary={summary} />
          ) : (
            <pre>{data.message}</pre>
          )}
          <div className="confirmation-actions">
            <a className="button wa" href={data.whatsapp_url}>
              <WhatsAppIcon size={19} />
              {t('openWhatsapp')}
            </a>
            <Link className="button line" href={'/' + locale}>
              {t('home')}
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
