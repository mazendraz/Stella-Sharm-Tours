import { stayDays } from '../booking';
import type { Locale } from '../index';

const periods = {
  en: [
    ['day', 'days'],
    ['night', 'nights'],
  ],
  it: [
    ['giorno', 'giorni'],
    ['notte', 'notti'],
  ],
  es: [
    ['día', 'días'],
    ['noche', 'noches'],
  ],
  fr: [
    ['jour', 'jours'],
    ['nuit', 'nuits'],
  ],
  de: [
    ['Tag', 'Tage'],
    ['Nacht', 'Nächte'],
  ],
  ru: [
    ['день', 'дня', 'дней'],
    ['ночь', 'ночи', 'ночей'],
  ],
  tr: [
    ['gün', 'gün'],
    ['gece', 'gece'],
  ],
} satisfies Record<Locale, readonly [readonly string[], readonly string[]]>;

export function bookingStay(
  start: string,
  end: string | undefined,
  locale: Locale,
) {
  if (!end) return start;
  const days = stayDays(start, end);
  const plural = new Intl.PluralRules(locale);
  const count = (value: number, forms: readonly string[]) => {
    const category = plural.select(value);
    const index =
      category === 'one' ? 0 : category === 'few' ? 1 : forms.length - 1;
    return value + ' ' + forms[index];
  };
  const [day, night] = periods[locale];
  return `${start} → ${end} (${count(days, day)} / ${count(days - 1, night)})`;
}

export const storedScheduleNotice =
  'Schedule needs staff review: requested weekday differs from published run days.';
export const scheduleNotice = {
  en: 'The team will confirm whether the tours can run on these dates.',
  it: 'Il team confermerà se le escursioni sono disponibili in queste date.',
  es: 'El equipo confirmará si las excursiones están disponibles en estas fechas.',
  fr: 'L’équipe confirmera si les excursions sont disponibles à ces dates.',
  de: 'Das Team bestätigt, ob die Ausflüge an diesen Tagen stattfinden können.',
  ru: 'Команда подтвердит, можно ли провести экскурсии в эти даты.',
  tr: 'Ekibimiz turların bu tarihlerde yapılıp yapılamayacağını teyit edecek.',
} satisfies Record<Locale, string>;

// Keep recipient-facing labels together so every mail uses one language.
const staffBookingLabels = {
  en: [
    'New request',
    'Name',
    'Phone',
    'Email',
    'Date',
    'Guests',
    'Format',
    'Pickup',
    'Day',
    'Notes',
    'Stay',
    'Group',
    'Private',
  ],
  it: [
    'Nuova richiesta',
    'Nome',
    'Telefono',
    'Email',
    'Data',
    'Ospiti',
    'Formula',
    'Ritiro',
    'Giorno',
    'Note',
    'Soggiorno',
    'Gruppo',
    'Privata',
  ],
  es: [
    'Nueva solicitud',
    'Nombre',
    'Teléfono',
    'Correo electrónico',
    'Fecha',
    'Viajeros',
    'Modalidad',
    'Recogida',
    'Día',
    'Notas',
    'Estancia',
    'Grupo',
    'Privada',
  ],
  fr: [
    'Nouvelle demande',
    'Nom',
    'Téléphone',
    'E-mail',
    'Date',
    'Participants',
    'Formule',
    'Prise en charge',
    'Jour',
    'Notes',
    'Séjour',
    'Groupe',
    'Privée',
  ],
  de: [
    'Neue Anfrage',
    'Name',
    'Telefon',
    'E-Mail',
    'Datum',
    'Gäste',
    'Reiseform',
    'Abholung',
    'Tag',
    'Notizen',
    'Aufenthalt',
    'Gruppe',
    'Privat',
  ],
  ru: [
    'Новая заявка',
    'Имя',
    'Телефон',
    'Эл. почта',
    'Дата',
    'Гости',
    'Формат',
    'Место трансфера',
    'День',
    'Примечания',
    'Период пребывания',
    'Групповой',
    'Индивидуальный',
  ],
  tr: [
    'Yeni talep',
    'Ad',
    'Telefon',
    'E-posta',
    'Tarih',
    'Misafirler',
    'Tur türü',
    'Alınış yeri',
    'Gün',
    'Notlar',
    'Konaklama',
    'Grup',
    'Özel',
  ],
} as const satisfies Record<Locale, readonly string[]>;

export function staffBookingCopy(locale: Locale) {
  const [
    subject,
    name,
    phone,
    email,
    date,
    guests,
    format,
    pickup,
    day,
    notes,
    stay,
    group,
    privateTour,
  ] = staffBookingLabels[locale];
  return {
    subject,
    name,
    phone,
    email,
    date,
    guests,
    format,
    pickup,
    day,
    notes,
    stay,
    group,
    privateTour,
  };
}

export const authMailCopy = {
  en: [
    'Set up your Stella account',
    'Use this link to set up your account.',
    'Reset your Stella password',
    'Use this link to reset your password.',
  ],
  it: [
    'Configura il tuo account Stella',
    'Usa questo link per configurare il tuo account.',
    'Reimposta la password di Stella',
    'Usa questo link per reimpostare la password.',
  ],
  es: [
    'Configura tu cuenta de Stella',
    'Usa este enlace para configurar tu cuenta.',
    'Restablece tu contraseña de Stella',
    'Usa este enlace para restablecer tu contraseña.',
  ],
  fr: [
    'Configurez votre compte Stella',
    'Utilisez ce lien pour configurer votre compte.',
    'Réinitialisez votre mot de passe Stella',
    'Utilisez ce lien pour réinitialiser votre mot de passe.',
  ],
  de: [
    'Richte dein Stella-Konto ein',
    'Richte dein Konto über diesen Link ein.',
    'Setze dein Stella-Passwort zurück',
    'Setze dein Passwort über diesen Link zurück.',
  ],
  ru: [
    'Настройте учётную запись Stella',
    'Перейдите по ссылке, чтобы настроить учётную запись.',
    'Сбросьте пароль Stella',
    'Перейдите по ссылке, чтобы сбросить пароль.',
  ],
  tr: [
    'Stella hesabınızı kurun',
    'Hesabınızı kurmak için bu bağlantıyı kullanın.',
    'Stella parolanızı sıfırlayın',
    'Parolanızı sıfırlamak için bu bağlantıyı kullanın.',
  ],
} as const satisfies Record<Locale, readonly [string, string, string, string]>;
