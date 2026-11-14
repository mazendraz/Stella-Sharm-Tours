// Only source facts are normalized. Unknown duration/capacity/child rules stay null.
export function durationFacts(label: string) {
  const days = label.match(/(\d+) days?/i);
  const normalized = label.replace('½', '.5');
  const hours = normalized.match(/(?:~)?(\d+(?:\.\d+)?)\s*(?:h\b|hours?\b)/i);
  return {
    daysCount: days ? Number(days[1]) : 1,
    durationMinutes: hours ? Math.round(Number(hours[1]) * 60) : null,
    overnight: /overnight|night/i.test(label),
  };
}
export function runDays(label: string) {
  const names = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const days = names.flatMap((name, i) => (label.includes(name) ? [i] : []));
  return days.length ? days : null;
}
export function splitNotes(notes: string[]) {
  const internal =
    /resolved:|confirm|photos?\b|video\b|flyer|price list|ask Stella|animal-welfare|matches the/i;
  return {
    public: notes.filter((n) => !internal.test(n)),
    editorial: notes.filter((n) => internal.test(n)),
  };
}
