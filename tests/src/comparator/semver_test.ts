import SemverComparator from '../../../src/comparator/semver.ts';
import { assertEquals } from '@std/assert';

const comparator = new SemverComparator();

Deno.test('semver comparator reports a newer release as updated', () => {
  assertEquals(comparator.updated('v2.9.4', 'v2.10.0'), true);
  assertEquals(comparator.updated('2.9.4', '2.10.0'), true);
});

Deno.test('semver comparator compares numerically, not lexically', () => {
  // A plain string comparison would rank v2.9.4 above v2.10.0.
  assertEquals(comparator.updated('v2.10.0', 'v2.9.4'), false);
});

Deno.test('semver comparator ignores an unchanged release', () => {
  assertEquals(comparator.updated('v2.10.0', 'v2.10.0'), false);
});

Deno.test('semver comparator treats a first sighting as an update', () => {
  assertEquals(comparator.updated('', 'v2.10.0'), true);
});

Deno.test('semver comparator ignores an empty read', () => {
  assertEquals(comparator.updated('v2.10.0', ''), false);
});

Deno.test('semver comparator handles prereleases', () => {
  assertEquals(comparator.updated('v2.10.0-rc.1', 'v2.10.0'), true);
  assertEquals(comparator.updated('v2.10.0', 'v2.10.0-rc.1'), false);
});

Deno.test('semver comparator falls back to equality for non-semver tags', () => {
  assertEquals(comparator.updated('2024.05.01', '2024.06.01'), true);
  assertEquals(comparator.updated('2024.05.01', '2024.05.01'), false);
  assertEquals(comparator.updated('release-1.2.3', 'release-1.2.4'), true);
});
