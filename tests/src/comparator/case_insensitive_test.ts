import CaseInsensitiveComparator from '../../../src/comparator/case-insensitive.ts';
import { assertEquals } from '@std/assert';

const comparator = new CaseInsensitiveComparator();

Deno.test('case-insensitive comparator reports differing content as updated', () => {
  assertEquals(comparator.updated('20 Aug 2026', '21 Aug 2026'), true);
});

Deno.test('case-insensitive comparator ignores a case-only change', () => {
  assertEquals(comparator.updated('Wembley Stadium', 'WEMBLEY STADIUM'), false);
  assertEquals(comparator.updated('wembley stadium', 'Wembley Stadium'), false);
});

Deno.test('case-insensitive comparator ignores unchanged content', () => {
  assertEquals(comparator.updated('20 Aug 2026', '20 Aug 2026'), false);
});

Deno.test('case-insensitive comparator treats a first sighting as an update', () => {
  assertEquals(comparator.updated('', '20 Aug 2026'), true);
});

Deno.test('case-insensitive comparator ignores an empty read', () => {
  // A failed scrape must not be reported as a change, nor overwrite good state.
  assertEquals(comparator.updated('20 Aug 2026', ''), false);
  assertEquals(comparator.updated('', ''), false);
});

Deno.test('case-insensitive comparator catches a reschedule that does not change length', () => {
  // The whole reason this exists: a length comparison misses same-length edits.
  const before = '20 Aug 2026, 21 Aug 2026, 22 Aug 2026';
  const after = '20 Aug 2026, 21 Aug 2026, 23 Aug 2026';
  assertEquals(before.length, after.length);
  assertEquals(comparator.updated(before, after), true);
});

Deno.test('case-insensitive comparator catches a removal', () => {
  // A cancelled show shortens the string; a "grew longer" check would stay silent.
  assertEquals(comparator.updated('20 Aug 2026, 21 Aug 2026', '20 Aug 2026'), true);
});

Deno.test('case-insensitive comparator is case-insensitive across accented characters', () => {
  assertEquals(comparator.updated('São Paulo', 'SÃO PAULO'), false);
  // Accents still count as a real difference, unlike case.
  assertEquals(comparator.updated('São Paulo', 'Sao Paulo'), true);
});
