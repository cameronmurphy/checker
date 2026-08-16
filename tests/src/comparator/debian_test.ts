import DebianComparator, { compare } from '../../../src/comparator/debian.ts';
import { assertEquals } from '@std/assert';

const comparator = new DebianComparator();

Deno.test('debian comparator reports a newer upstream version as updated', () => {
  assertEquals(comparator.updated('8.5.4', '8.5.9'), true);
  assertEquals(comparator.updated('8.5.9', '8.5.4'), false);
  assertEquals(comparator.updated('8.5.9', '8.5.9'), false);
});

Deno.test('debian comparator sees a revision-only bump, which a security update usually is', () => {
  // Ubuntu patches in place: the upstream version is 8.3.6 either side, and only the packaging
  // revision moves. Comparing upstream versions alone would go silent on every security update.
  assertEquals(comparator.updated('8.3.6-0ubuntu0.24.04.9', '8.3.6-0ubuntu0.24.04.10'), true);
  assertEquals(comparator.updated('8.3.6-0ubuntu0.24.04.10', '8.3.6-0ubuntu0.24.04.9'), false);
});

Deno.test('debian comparator compares each run of digits numerically', () => {
  // A string comparison ranks .9 above .10, and 8.5.9 above 8.5.10.
  assertEquals(compare('8.5.10', '8.5.9') > 0, true);
  assertEquals(compare('1.0-9', '1.0-10') < 0, true);
  assertEquals(compare('8.5.09', '8.5.9'), 0);
});

Deno.test('debian comparator sorts a tilde below the release it leads up to', () => {
  assertEquals(compare('8.5.0~rc1', '8.5.0') < 0, true);
  assertEquals(compare('8.5.0~rc1', '8.5.0~rc2') < 0, true);
  assertEquals(compare('1.0~~', '1.0~') < 0, true);
  assertEquals(comparator.updated('8.5.0~rc1', '8.5.0'), true);
  assertEquals(comparator.updated('8.5.0', '8.5.0~rc1'), false);
});

Deno.test('debian comparator gives the epoch the last word', () => {
  // An epoch exists to say "this is newer despite the version going backwards", so it outranks
  // everything after the colon.
  assertEquals(compare('1:1.0', '2.0') > 0, true);
  assertEquals(compare('1:1.0', '1:1.1') < 0, true);
  assertEquals(compare('0:1.0', '1.0'), 0);
});

Deno.test('debian comparator ranks a missing revision below any revision', () => {
  assertEquals(compare('1.0', '1.0-1') < 0, true);
  assertEquals(compare('1.0-1', '1.0') > 0, true);
});

Deno.test('debian comparator handles the long PPA versions in full', () => {
  const before = '8.5.4-1+ubuntu24.04.1+deb.sury.org+1';
  const after = '8.5.9-1+ubuntu24.04.1+deb.sury.org+1';

  assertEquals(comparator.updated(before, after), true);
  assertEquals(comparator.updated(after, before), false);
  // The same upstream release rebuilt for the archive, which is still worth hearing about.
  assertEquals(
    comparator.updated('8.5.9-1+ubuntu24.04.1+deb.sury.org+1', '8.5.9-1+ubuntu24.04.1+deb.sury.org+2'),
    true,
  );
});

Deno.test('debian comparator sorts letters before the punctuation that follows them', () => {
  // dpkg's own rule, and the reason 'alpha' ranks below 'alpha+git'.
  assertEquals(compare('1.0alpha', '1.0alpha+git') < 0, true);
  assertEquals(compare('1.0a', '1.0b') < 0, true);
});

Deno.test('debian comparator treats a first sighting as an update and an empty read as nothing', () => {
  assertEquals(comparator.updated('', '8.5.9'), true);
  assertEquals(comparator.updated('8.5.9', ''), false);
});
