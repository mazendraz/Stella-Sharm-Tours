/**
 * Guest quotes for the home "Why Stella" section, copied verbatim from
 * data/google-reviews.json (captured from the public Google listing on
 * 2026-11-26). Never edit, shorten or translate the text: why-us-quotes.test.ts
 * checks every quote against the source file byte for byte.
 *
 * Visitors see quotes in their own language; German has no reviews yet, so
 * German and every other language fall back to English.
 */
export type GuestQuote = {
  id: string;
  author: string;
  lang: string;
  text: string;
};

/** Overall Google rating at capture time (data/google-reviews.json meta). */
export const googleRating = {
  rating: 5.0,
  count: 499,
  capturedAt: '2026-11-26',
};

export const googleListingUrl =
  'https://www.google.com/maps/place/Stella+sharm+tours+by+heroes+travel/@27.8669735,34.293776,17z/data=!4m8!3m7!1s0x14533b00629c9acd:0x45ce161e00e9f2bf!8m2!3d27.8669735!4d34.293776!9m1!1b1!16s%2Fg%2F11msgw0xlv';

export const guestQuotes: Record<string, GuestQuote[]> = {
  en: [
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT25CR09XNW5jSGhSVUZsT1FqTjBlbEZtU0VwSE4zYxAB',
      author: 'Naira RaShaD',
      lang: 'en',
      text: '​Top-notch service and seamless planning for  getaway. A trustworthy company that truly cares about its clients—I will definitely book with them again.',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT25Sek56SlphM2xvYkhZNGQyZExUekYzVmxOME4wRRAB',
      author: 'Shak Ali',
      lang: 'en',
      text: "Our guide was brilliant, very professional, Knowledgeable, felt very safe and welcoming.\nThe guide / tour wasn't rushed and paid attention to detail. I would highly recommend 10000%",
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT21KeFQwWktNMVpXVWt0NE0wNVNTVGxVVjJwTFNHYxAB',
      author: 'Mhimdi Oumayma',
      lang: 'en',
      text: 'They provide an amazing experience! The staff is professional, friendly, punctual, and full of positive energy. The atmosphere is fantastic, and everyone is incredibly kind and welcoming. I highly recommend this agency❤❤',
    },
  ],
  it: [
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT25jNU0wcDFNa2gzY25BeWVuVk5aVjlXV0dKR1IzYxAB',
      author: 'Alessia Scipione',
      lang: 'it',
      text: 'Guida fantastica tutto organizzato nei minimi dettagli , viaggio,soste,snorkeling,immersioni, tutto fantastico ❤️ anche con i bambini tutti bravissimi😍\n\nConsigliatissimo !!',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT2pKNVlqSnJPQzFuYlU0eGJVaFNSbTl6WDFGelNVRRAB',
      author: 'Krystel Ped',
      lang: 'it',
      text: "Esperienza bellissima tutto favoloso grazie ai ragazzi sono riuscita a vedere anch'io la barriera!",
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT2xJeU1VbDZXa2gyVFhKclFWQjJMV2h2T0dwRlZXYxAB',
      author: 'Esse BI BI',
      lang: 'it',
      text: 'Wow stupendo tutto, barca mare cibo tutto divertente, poi Ismail che bravo e gentile ci rivedremo il prossimo anno ❤️',
    },
  ],
  es: [
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT2xSRlRVeFFORE5LYzFoWmJVUjZaMlpQZG1sUWJtYxAB',
      author: 'Ana María Urrego Florez',
      lang: 'es',
      text: 'Super Recomendados, el precio es economico y la calidad de los tour excelente, atentos y muy amables, tienen siempre todo listo y preparado, todos los tours son muy completos y organizados, Recomendado al 100%',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT21NMVgzSTFXR3BhV2tWWk9WWkRTWEpPUVV0ck5sRRAB',
      author: 'Susana García',
      lang: 'es',
      text: 'Un gran trabajo del equipo entero. Muy atentos en todo tipo de detalles. Ayudan muchísimo en todos los sentidos.\nVolveríamos a repetir!!',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT2w5c04xSnpjVTlNVTI5MlgxZzNaRmRKWkMxUFoxRRAB',
      author: 'Silvia Chaves',
      lang: 'es',
      text: 'Experiencia increíble muy recomendable. Yo hice quads y los guías muy agradables y atentos',
    },
  ],
  fr: [
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT21WeE5Vd3pVV0U0V0VGNGRtMDRkekpITkdwR01WRRAB',
      author: 'Yassine Lakhlifi',
      lang: 'fr',
      text: 'Nous avons passé une agréable journée, staff très professionnel et a l’écoute, la plongée était une tuerie faites en couple je le conseille vivement.',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT25oSlkyNHphakEwVkRaalJGbDNVbmRQZEd3NU0wRRAB',
      author: 'ribolini jonathan',
      lang: 'fr',
      text: 'Merci à Erman pour l’organisation de nos excursions en famille!!!\nEn particulier la journée en bateau privé.\nÀ très vite',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT2xGNGJGUmxNV1ZHT1ZNNWJ6SkNVbTkyVEVsRE5XYxAB',
      author: 'selma',
      lang: 'fr',
      text: 'Excellent experience  l’équipe est super\nÀ refaire  et très professionnel',
    },
  ],
  ru: [
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT2pabVRXNVliMnhoZWtVMmNrbDBRV3B6UW1wSlptYxAB',
      author: 'Ekatetina Golyadkina',
      lang: 'ru',
      text: 'Отличная компания.  Все прошло по договорённости. Прогулка на катере была супер. Капитан понял какой у нас интерес и делал акцент на нём.\nСпасибо',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT2xSbGJWcFJURWh6YzFrd2RXUm9abVUwWlVJMlNWRRAB',
      author: 'Сергей Змитрукевич',
      lang: 'ru',
      text: 'Брали 4 экскурсии, сафари, дайвинг, гору Моисея и купание в дельфинами.\nВсе было организовано отлично, без нареканий, цены адекватные, куча новых эмоций)',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT25ZMmFVZE9aVTFDVVhwTVJuSlJibXhRWW1sbWVYYxAB',
      author: 'Maksim Shubenok',
      lang: 'ru',
      text: 'Спасибо большое за такую яркую, впечатляющую экскурсию!  Эти виды навсегда останутся в нашей памяти!❤️\nДайвинг- отдельный вид искусства!🫶',
    },
  ],
  tr: [
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT25oWE5FRldaRVZDVUdOalYwSk1NWEZvU201dVVWRRAB',
      author: 'Fatih Keşvelioğlu',
      lang: 'tr',
      text: 'Mısıra ilk gelişimiz atv safari turu deve binişi bedevi gecesi her şey harikaydı muhteşem bir deneyim oldu bizim için çalışanlar çom güler yüzlüydü herkese teşekkür ederiz',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT21WblVsSXlNVUYwWjFrMlFUWmZTM0ZDT0VscExYYxAB',
      author: 'Tolga',
      lang: 'tr',
      text: 'Jamal çok yardımseverdi başından sonuna çok güzel bir turdu. Mercan resimleri ve balıklar görülmeye değerdi. Ekstra dalış yapmayı öneririm.',
    },
    {
      id: 'Ci9DQUlRQUNvZENodHljRjlvT25WME1qSTJWSGh2YkROWmFYWlNRekZTTkRSZlpHYxAB',
      author: 'Faruk Sevgin',
      lang: 'tr',
      text: 'Safari turu ve deve turu çok eğlenceliydi. Bedevi gösterisiyle birlikte toplam 5 saat güzel bir turdu. Rehber Walid bizimle çok ilgilendi herhangi bir sorun yaşamadık. Walide burdan sevgiler, teşekkürler.',
    },
  ],
};

export function quotesFor(locale: string): GuestQuote[] {
  return guestQuotes[locale] ?? guestQuotes.en ?? [];
}
