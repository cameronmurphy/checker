import { TextSource } from '../../../../src/plugins/source/text.ts';
import * as mock from '@std/testing/mock';
import { assertEquals } from '@std/assert';

const URL_A = 'https://dl.deno.land/release-lts-latest.txt';
const URL_B = 'https://example.com/';

function source(items: string[] = [URL_A], comparator: 'case_insensitive' | 'semver' = 'case_insensitive'): TextSource {
  const plugin = new TextSource();
  plugin.setConfig({ interval: 3600, items, comparator });
  return plugin;
}

async function read(item: string, body: string, status = 200): Promise<string> {
  const plugin = source([item]);
  const fetchStub = mock.stub(globalThis, 'fetch', () => Promise.resolve(new Response(body, { status })));

  try {
    return await plugin.read(item);
  } finally {
    fetchStub.restore();
  }
}

Deno.test('text source stores the body itself, trimmed', async () => {
  assertEquals(await read(URL_A, 'v2.9.3\n'), 'v2.9.3');
  assertEquals(await read(URL_A, '  1.4.2  '), '1.4.2');
});

Deno.test('text source notifies on any change by default', () => {
  const plugin = source();

  // Nothing about a text file says its value is ordered, so the default treats a revert as a change.
  assertEquals(plugin.updated('v2.9.3', 'v2.9.4'), true);
  assertEquals(plugin.updated('v2.9.4', 'v2.9.3'), true);
  assertEquals(plugin.updated('v2.9.3', 'v2.9.3'), false);
  assertEquals(plugin.updated('Stable', 'stable'), false);
});

Deno.test('text source only notifies when the version climbs under the semver comparator', () => {
  const plugin = source([URL_A], 'semver');

  assertEquals(plugin.updated('v2.9.3', 'v2.9.4'), true);
  assertEquals(plugin.updated('v2.9.4', 'v2.9.3'), false);
  assertEquals(plugin.updated('v2.9.3', 'v2.9.3'), false);

  // Build numbers and channel markers still notify, in either direction, rather than going silent.
  assertEquals(plugin.updated('stable', 'beta'), true);
  assertEquals(plugin.updated('beta', 'stable'), true);
});

Deno.test('text source defaults the comparator when the config omits it', () => {
  const parsed = new TextSource().getSchema().parse({ interval: 3600, items: [URL_A] });

  assertEquals(parsed.comparator, 'case_insensitive');
});

Deno.test('text source rejects a comparator it does not have', () => {
  const schema = new TextSource().getSchema();

  assertEquals(schema.safeParse({ interval: 3600, items: [URL_A], comparator: 'semver' }).success, true);
  assertEquals(schema.safeParse({ interval: 3600, items: [URL_A], comparator: 'strlen' }).success, false);
});

Deno.test('text source returns nothing when the request fails', async () => {
  assertEquals(await read(URL_A, '', 503), '');
});

Deno.test('text source refuses a body that is not one short line', async () => {
  // The body is the stored value, so a whole page would land in state. That is what page is for.
  assertEquals(await read(URL_A, 'v2.9.3\nv2.9.2'), '');
  assertEquals(await read(URL_A, 'x'.repeat(257)), '');
  assertEquals(await read(URL_A, 'x'.repeat(256)), 'x'.repeat(256));
});

Deno.test('text source names the file and carries the value in its messages', async () => {
  const plugin = source();
  const version = await read(URL_A, 'v2.9.3');

  assertEquals(plugin.message('', version, URL_A), 'release-lts-latest.txt: first seen value is v2.9.3');
  assertEquals(plugin.message('v2.9.2', version, URL_A), 'release-lts-latest.txt: v2.9.3 (was v2.9.2)');

  // A URL with no path segment falls back to the host rather than an empty label.
  assertEquals(plugin.message('', version, URL_B), 'example.com: first seen value is v2.9.3');
});

Deno.test('text source rejects items that are not URLs', () => {
  const schema = source().getSchema();

  assertEquals(schema.safeParse({ interval: 3600, items: [URL_A] }).success, true);
  assertEquals(schema.safeParse({ interval: 3600, items: ['release-lts-latest.txt'] }).success, false);
  assertEquals(schema.safeParse({ interval: 3600, items: [] }).success, false);
});
