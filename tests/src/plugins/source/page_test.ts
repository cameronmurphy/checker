import { PageSource } from '../../../../src/plugins/source/page.ts';
import * as mock from '@std/testing/mock';
import { assertEquals, assertNotEquals } from '@std/assert';

const URL_A = 'https://platform.claude.com/docs/en/api/claude-code/routines-fire.md';
const URL_B = 'https://example.com/';

function source(items: string[] = [URL_A]): PageSource {
  const plugin = new PageSource();
  plugin.setConfig({ interval: 3600, items });
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

Deno.test('page source reduces a body to a stable hash', async () => {
  const first = await read(URL_A, 'hello');
  const second = await read(URL_A, 'hello');

  assertEquals(first, second);
  assertEquals(first.length, 64);
  assertNotEquals(first, await read(URL_A, 'hello!'));
});

Deno.test('page source notifies on any difference, in either direction', () => {
  const plugin = source();

  // Not a version, so there is no ordering to respect — a page that reverts is still a change.
  assertEquals(plugin.updated('a'.repeat(64), 'b'.repeat(64)), true);
  assertEquals(plugin.updated('b'.repeat(64), 'a'.repeat(64)), true);
  assertEquals(plugin.updated('a'.repeat(64), 'a'.repeat(64)), false);
});

Deno.test('page source returns nothing when the request fails', async () => {
  // app.ts treats a falsy read as "skip this item", so a blip leaves the stored hash alone rather
  // than reporting itself as a change.
  assertEquals(await read(URL_A, '', 503), '');
});

Deno.test('page source names the page in its messages', async () => {
  const plugin = source();
  const hash = await read(URL_A, 'hello');

  assertEquals(plugin.message('', hash, URL_A), `routines-fire.md: watching (${hash.slice(0, 12)})`);
  assertEquals(
    plugin.message('a'.repeat(64), hash, URL_A),
    `routines-fire.md: the page changed (aaaaaaaaaaaa → ${hash.slice(0, 12)})`,
  );

  // A URL with no path segment falls back to the host rather than an empty label.
  assertEquals(plugin.message('', hash, URL_B), `example.com: watching (${hash.slice(0, 12)})`);
});

Deno.test('page source rejects items that are not URLs', () => {
  const schema = source().getSchema();

  assertEquals(schema.safeParse({ interval: 3600, items: [URL_A] }).success, true);
  assertEquals(schema.safeParse({ interval: 3600, items: ['routines-fire.md'] }).success, false);
  assertEquals(schema.safeParse({ interval: 3600, items: [] }).success, false);
});
