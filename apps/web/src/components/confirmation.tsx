'use client';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  confirmationSchema,
  type Confirmation as ConfirmationType,
} from '@stella/shared/booking';
export function Confirmation({ reference }: { reference: string }) {
  const t = useTranslations();
  const [data, setData] = useState<ConfirmationType | null>(null);
  useEffect(() => {
    try {
      const raw = JSON.parse(
        sessionStorage.getItem('stella.confirmation.' + reference) ?? 'null',
      );
      if (raw?.expires > Date.now()) {
        const parsed = confirmationSchema.safeParse(raw);
        if (parsed.success) setData(parsed.data);
      } else sessionStorage.removeItem('stella.confirmation.' + reference);
    } catch {}
  }, [reference]);
  return (
    <main className="wrap confirmation-page" id="main">
      <p className="kicker">
        <bdi>{reference}</bdi>
      </p>
      <h1>{t(data ? 'sent' : 'request')}</h1>
      <p>{t(data ? 'sentSub' : 'confirmationMissing')}</p>
      {data && (
        <>
          <pre>{data.message}</pre>
          <a className="button wa" href={data.whatsapp_url}>
            <WhatsAppIcon size={19} />
            {t('openWhatsapp')}
          </a>
        </>
      )}
    </main>
  );
}
