import { describe, expect, it } from 'vitest';
import { acknowledgeEditorSection, loc, locSet, locState, same } from './loc';

describe('editor save acknowledgements', () => {
  it('uses the submitted values as the baseline and keeps edits made during the save', () => {
    const initial = loc({ en: 'Before', it: 'Prima' });
    const submitted = { title: locSet(initial, 'it', 'Inviato'), minutes: 15 };
    const current = {
      title: locSet(submitted.title, 'en', 'New'),
      minutes: 20,
    };
    const { base, values } = acknowledgeEditorSection(submitted, current);
    expect(base.minutes).toBe(15);
    expect(values.minutes).toBe(20);
    expect(values.title.raw.en).toBe('New');
    expect(values.title.init.en).toBe('Before');
    expect(values.title.init.it).toBe('Inviato');
    expect(locState(values.title, 'it')).toBe('stale');
    expect(same(base, values)).toBe(false);
  });
  it('acknowledges the same translated fields when their rows were reordered', () => {
    const first = loc({ en: 'First' });
    const second = loc({ en: 'Second' });
    const submitted = [first, second];
    const current = [locSet(second, 'en', 'Changed'), first];
    const { values } = acknowledgeEditorSection(submitted, current);
    expect(values[0]!.init.en).toBe('Second');
    expect(values[0]!.raw.en).toBe('Changed');
    expect(values[1]!.init.en).toBe('First');
  });
});
