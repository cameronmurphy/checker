import SemverMajorComparator from '../../../src/comparator/semver-major.ts';
import { assertEquals } from '@std/assert';

const comparator = new SemverMajorComparator();

Deno.test('semver major comparator reports a new major as updated', () => {
  assertEquals(comparator.updated('57.0.26', '58.0.0'), true);
  assertEquals(comparator.updated('v2.9.4', 'v3.0.0'), true);
});

Deno.test('semver major comparator ignores minors and patches', () => {
  assertEquals(comparator.updated('57.0.26', '57.0.27'), false);
  assertEquals(comparator.updated('57.0.26', '57.1.0'), false);
  assertEquals(comparator.updated('57.0.26', '57.0.26'), false);
});

Deno.test('semver major comparator ignores a major going backwards', () => {
  // An unpublish moving a dist-tag back a major isn't a release to notify about.
  assertEquals(comparator.updated('58.0.0', '57.0.26'), false);
});

Deno.test('semver major comparator counts a prerelease of the next major', () => {
  assertEquals(comparator.updated('57.0.26', '58.0.0-rc.1'), true);
  assertEquals(comparator.updated('57.0.26', '57.1.0-rc.1'), false);
});

Deno.test('semver major comparator treats a first sighting as an update', () => {
  assertEquals(comparator.updated('', '57.0.26'), true);
});

Deno.test('semver major comparator ignores an empty read', () => {
  assertEquals(comparator.updated('57.0.26', ''), false);
});

Deno.test('semver major comparator falls back to equality for non-semver tags', () => {
  assertEquals(comparator.updated('2024.05.01', '2024.06.01'), true);
  assertEquals(comparator.updated('2024.05.01', '2024.05.01'), false);
  assertEquals(comparator.updated('nightly', 'nightly-2'), true);
});
