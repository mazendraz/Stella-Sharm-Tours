import type { Text as LocalText } from '@stella/shared/public-contract';
export function Content({ value }: { value: LocalText | null | undefined }) {
  return value ? <span lang={value.lang}>{value.text}</span> : null;
}
