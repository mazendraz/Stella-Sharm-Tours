/** Quoted CSV still evaluates formulas in spreadsheet apps; force dangerous cells to text. */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^(?:\s*[=+\-@]|[\t\r\n])/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
