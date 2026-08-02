import { NodejsSource } from '../../../../src/plugins/source/nodejs.ts';
import * as mock from '@std/testing/mock';
import { assertEquals } from '@std/assert';

type Release = { version: string; date?: string; lts?: string | false; security?: boolean };

// Deliberately out of order, so selection can't be passing by taking the first entry.
const FEED: Release[] = [
  { version: 'v24.18.0', date: '2026-06-23', lts: 'Krypton', security: false },
  { version: 'v26.5.1', date: '2026-07-28', lts: false, security: true },
  { version: 'v22.23.2', date: '2026-07-28', lts: 'Jod', security: true },
  { version: 'v24.18.1', date: '2026-07-28', lts: 'Krypton', security: true },
  { version: 'v26.5.0', date: '2026-07-08', lts: false, security: false },
  { version: 'v24.9.0', date: '2026-01-14', lts: 'Krypton', security: false },
];

function source(items: string[] = ['24']): NodejsSource {
  const plugin = new NodejsSource();
  plugin.setConfig({ interval: 3600, items });
  return plugin;
}

async function read(item: string, feed: Release[] | null = FEED, status = 200): Promise<string> {
  const plugin = source([item === 'lts' || item === 'latest' ? item : item]);
  const fetchStub = mock.stub(
    globalThis,
    'fetch',
    () => Promise.resolve(new Response(JSON.stringify(feed ?? []), { status })),
  );

  try {
    return await plugin.read(item);
  } finally {
    fetchStub.restore();
  }
}

Deno.test('nodejs source follows a single major line', async () => {
  // /releases/latest style selection would give v26.5.1; the pin is on 24.
  assertEquals(await read('24'), 'v24.18.1');
  assertEquals(await read('22'), 'v22.23.2');
});

Deno.test('nodejs source picks the newest lts across lines', async () => {
  assertEquals(await read('lts'), 'v24.18.1');
});

Deno.test('nodejs source picks the newest release overall', async () => {
  assertEquals(await read('latest'), 'v26.5.1');
});

Deno.test('nodejs source does not confuse a major with a longer one', async () => {
  // 'v2.' must not match 'v24.18.1'.
  assertEquals(await read('2', [{ version: 'v2.5.0' }, { version: 'v24.18.1' }]), 'v2.5.0');
});

Deno.test('nodejs source returns nothing for a major that does not exist', async () => {
  assertEquals(await read('99'), '');
});

Deno.test('nodejs source returns nothing when the feed has no releases', async () => {
  assertEquals(await read('24', []), '');
});

Deno.test('nodejs source returns nothing when the request fails', async () => {
  // app.ts treats a falsy read as "skip this item", leaving stored state untouched.
  assertEquals(await read('24', null, 503), '');
});

Deno.test('nodejs source reports upgrades in the house style', async () => {
  const plugin = source();
  const fetchStub = mock.stub(
    globalThis,
    'fetch',
    () => Promise.resolve(new Response(JSON.stringify(FEED), { status: 200 })),
  );

  try {
    const version = await plugin.read('24');
    assertEquals(
      plugin.message('v24.18.0', version, '24'),
      'Node.js 24: new version v24.18.1 (was v24.18.0) (security release)',
    );
    assertEquals(
      plugin.message('', version, '24'),
      'Node.js 24: first seen version is v24.18.1 (security release)',
    );
  } finally {
    fetchStub.restore();
  }
});

Deno.test('nodejs source marks security releases only when the selected release is one', async () => {
  const plugin = source();
  const feed: Release[] = [{ version: 'v24.18.0', lts: 'Krypton', security: false }];
  const fetchStub = mock.stub(
    globalThis,
    'fetch',
    () => Promise.resolve(new Response(JSON.stringify(feed), { status: 200 })),
  );

  try {
    const version = await plugin.read('24');
    assertEquals(plugin.message('v24.17.0', version, '24'), 'Node.js 24: new version v24.18.0 (was v24.17.0)');
  } finally {
    fetchStub.restore();
  }
});

Deno.test('nodejs source rejects items that are not a major, lts or latest', () => {
  const schema = source().getSchema();

  for (const items of [['24'], ['lts'], ['latest']]) {
    assertEquals(schema.safeParse({ interval: 3600, items }).success, true);
  }

  for (const items of [['24.18.0'], ['v24'], ['node24'], ['']]) {
    assertEquals(schema.safeParse({ interval: 3600, items }).success, false);
  }

  assertEquals(schema.safeParse({ interval: 3600, items: [] }).success, false);
});
