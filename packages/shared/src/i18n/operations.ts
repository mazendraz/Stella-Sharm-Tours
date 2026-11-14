import type { Locale } from '../index';
type Copy = {
  subject: string;
  requests: string;
  trips: string;
  errors: string;
  empty: string;
};
/** Owner-facing operational mail: authored together in all seven core languages. */
export const operationsCopy: Record<Locale, Copy> = {
  en: {
    subject: 'Stella weekly operations',
    requests: 'Requests per day',
    trips: 'Most requested trips',
    errors: 'Errors: check the private monitoring dashboard.',
    empty: 'No requests in this period.',
  },
  it: {
    subject: 'Riepilogo operativo settimanale Stella',
    requests: 'Richieste al giorno',
    trips: 'Escursioni più richieste',
    errors: 'Errori: controlla il pannello di monitoraggio privato.',
    empty: 'Nessuna richiesta in questo periodo.',
  },
  es: {
    subject: 'Resumen operativo semanal de Stella',
    requests: 'Solicitudes por día',
    trips: 'Excursiones más solicitadas',
    errors: 'Errores: consulta el panel de supervisión privado.',
    empty: 'No hay solicitudes en este período.',
  },
  fr: {
    subject: 'Bilan opérationnel hebdomadaire Stella',
    requests: 'Demandes par jour',
    trips: 'Excursions les plus demandées',
    errors: 'Erreurs : consultez le tableau de surveillance privé.',
    empty: 'Aucune demande sur cette période.',
  },
  de: {
    subject: 'Wöchentlicher Betriebsbericht von Stella',
    requests: 'Anfragen pro Tag',
    trips: 'Am häufigsten angefragte Ausflüge',
    errors: 'Fehler: Prüfen Sie das private Überwachungsdashboard.',
    empty: 'Keine Anfragen in diesem Zeitraum.',
  },
  ru: {
    subject: 'Еженедельный рабочий отчёт Stella',
    requests: 'Заявки по дням',
    trips: 'Самые востребованные экскурсии',
    errors: 'Ошибки: проверьте закрытую панель мониторинга.',
    empty: 'За этот период заявок нет.',
  },
  tr: {
    subject: 'Stella haftalık faaliyet raporu',
    requests: 'Günlük talepler',
    trips: 'En çok talep edilen turlar',
    errors: 'Hatalar: özel izleme panelini kontrol edin.',
    empty: 'Bu dönemde talep yok.',
  },
};
