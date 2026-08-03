import { NpmSource } from '../../../../src/plugins/source/npm.ts';
import * as mock from '@std/testing/mock';
import { assertEquals } from '@std/assert';

// Deliberately out of order, so selection can't be passing by taking the first or last entry.
const VERSIONS = ['4.30.4', '5.0.1', '3.9.9', '4.31.0-beta.1', '4.30.6', '5.0.0', '4.9.0'];

function source(items: string[], tag = 'latest'): NpmSource {
  const plugin = new NpmSource();
  plugin.setConfig({ interval: 3600, items, tag });
  return plugin;
}

function packument(versions = VERSIONS): Response {
  const entries = Object.fromEntries(versions.map((version) => [version, { version }]));
  return new Response(JSON.stringify({ versions: entries }), { status: 200 });
}

async function read(item: string, response: () => Response, tag = 'latest'): Promise<string> {
  const plugin = source([item], tag);
  const fetchStub = mock.stub(globalThis, 'fetch', () => Promise.resolve(response()));

  try {
    return await plugin.read(item);
  } finally {
    fetchStub.restore();
  }
}

Deno.test('npm source follows a single major line when the item is a range', async () => {
  // A dist-tag read would give 5.0.1; the pin is on 4.
  assertEquals(await read('filepond@^4', () => packument()), '4.30.6');
  assertEquals(await read('filepond@4.x', () => packument()), '4.30.6');
  assertEquals(await read('filepond@~4.9', () => packument()), '4.9.0');
});

Deno.test('npm source ignores prereleases outside the range', async () => {
  // '^4' must not select 4.31.0-beta.1, the way npm itself wouldn't.
  assertEquals(await read('filepond@^4', () => packument()), '4.30.6');
  assertEquals(await read('filepond@^4.31.0-0', () => packument()), '4.31.0-beta.1');
});

Deno.test('npm source takes a range from the source-level tag', async () => {
  assertEquals(await read('filepond', () => packument(), '^4'), '4.30.6');
});

Deno.test('npm source keeps reading dist-tags through the tag endpoint', async () => {
  const plugin = source(['filepond@beta']);
  const fetchStub = mock.stub(globalThis, 'fetch', (input: string | URL | Request) => {
    assertEquals(String(input), 'https://registry.npmjs.org/filepond/beta');
    return Promise.resolve(new Response(JSON.stringify({ version: '4.31.0-beta.1' }), { status: 200 }));
  });

  try {
    assertEquals(await plugin.read('filepond@beta'), '4.31.0-beta.1');
  } finally {
    fetchStub.restore();
  }
});

Deno.test('npm source keeps scoped names intact when they carry a range', async () => {
  const plugin = source(['@types/node@^20']);
  const fetchStub = mock.stub(globalThis, 'fetch', (input: string | URL | Request) => {
    assertEquals(String(input), 'https://registry.npmjs.org/@types/node');
    return Promise.resolve(packument(['20.1.0', '22.0.0']));
  });

  try {
    assertEquals(await plugin.read('@types/node@^20'), '20.1.0');
  } finally {
    fetchStub.restore();
  }
});

Deno.test('npm source waits quietly for a range nothing satisfies yet', async () => {
  // A watch on the next major sits here indefinitely by design, and console.error reaches
  // destinations, so logging the miss would notify about every check of a range doing its job.
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(await read('filepond@^9', () => packument()), '');
    assertEquals(errors, []);
  } finally {
    errorStub.restore();
  }
});

Deno.test('npm source returns nothing when the packument request fails', async () => {
  assertEquals(await read('filepond@^4', () => new Response('', { status: 503 })), '');
});

Deno.test('npm source says a mistyped range is neither kind of track', async () => {
  // '^4x' isn't a range, so it falls through to a dist-tag lookup that can't succeed either. Saying
  // only that a tag fetch failed would send you looking for the wrong mistake.
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(await read('filepond@^4x', () => new Response('', { status: 404 })), '');
    assertEquals(errors, ['filepond: "^4x" is neither a valid version range nor a published dist-tag']);
  } finally {
    errorStub.restore();
  }
});

Deno.test('npm source still reports why a dist-tag fetch failed for other reasons', async () => {
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(await read('filepond@beta', () => new Response('', { status: 503, statusText: 'Unavailable' })), '');
    assertEquals(errors, ['Failed to fetch beta version for filepond: Unavailable']);
  } finally {
    errorStub.restore();
  }
});

Deno.test('npm source names the tracked range in its messages', () => {
  const plugin = source(['filepond@^4']);

  assertEquals(
    plugin.message('4.30.4', '4.30.6', 'filepond@^4'),
    'filepond (^4): new version 4.30.6 (was 4.30.4)',
  );
  assertEquals(
    plugin.message('', '4.30.6', 'filepond@^4'),
    'filepond (^4): first seen version is 4.30.6',
  );
});
