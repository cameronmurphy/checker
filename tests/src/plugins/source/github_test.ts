import { GithubSource } from '../../../../src/plugins/source/github.ts';
import * as mock from '@std/testing/mock';
import { assertEquals } from '@std/assert';

type Release = { tag_name: string; draft?: boolean; prerelease?: boolean };

function stubReleases(releases: Release[] | null, status = 200) {
  return mock.stub(
    globalThis,
    'fetch',
    () => Promise.resolve(new Response(JSON.stringify(releases ?? []), { status })),
  );
}

function source(items: string[], track: 'highest' | 'latest' = 'latest'): GithubSource {
  const plugin = new GithubSource();
  plugin.setConfig({ interval: 3600, items, track });
  return plugin;
}

async function read(releases: Release[] | null, status = 200): Promise<string> {
  const plugin = source(['owner/repo'], 'highest');

  const fetchStub = stubReleases(releases, status);

  try {
    return await plugin.read('owner/repo');
  } finally {
    fetchStub.restore();
  }
}

Deno.test('github source picks the highest version, not the most recently published', async () => {
  // pestphp/pest published a 4.x backport after 5.0.0, so /releases/latest reports v4.7.7 and the
  // whole 5.x line would otherwise be invisible.
  assertEquals(
    await read([
      { tag_name: 'v4.7.7' },
      { tag_name: 'v5.0.2' },
      { tag_name: 'v5.0.1' },
      { tag_name: 'v5.0.0' },
      { tag_name: 'v4.7.5' },
      { tag_name: 'v3.8.7' },
    ]),
    'v5.0.2',
  );
});

Deno.test('github source returns the tag exactly as published', async () => {
  // Stored state holds raw tags, so a normalised '8.34.0' would read as a change against 'v8.34.0'.
  assertEquals(await read([{ tag_name: 'v8.34.0' }, { tag_name: 'v8.33.0' }]), 'v8.34.0');
  assertEquals(await read([{ tag_name: '2.10.0' }, { tag_name: '2.9.4' }]), '2.10.0');
});

Deno.test('github source ignores drafts and prereleases', async () => {
  assertEquals(
    await read([
      { tag_name: 'v6.0.0', draft: true },
      { tag_name: 'v5.1.0', prerelease: true },
      { tag_name: 'v5.0.2' },
    ]),
    'v5.0.2',
  );
});

Deno.test('github source skips tags that are not semver', async () => {
  assertEquals(
    await read([
      { tag_name: 'nightly' },
      { tag_name: 'release-2026-08-01' },
      { tag_name: 'v1.4.0' },
      { tag_name: 'v1.3.0' },
    ]),
    'v1.4.0',
  );
});

Deno.test('github source falls back to the newest release when nothing parses', async () => {
  // Degrades to roughly what /releases/latest did rather than reporting nothing at all.
  assertEquals(await read([{ tag_name: 'nightly' }, { tag_name: 'rolling' }]), 'nightly');
});

Deno.test('github source handles a repository with no releases', async () => {
  assertEquals(await read([]), '');
});

Deno.test('github source returns nothing when the request fails', async () => {
  // app.ts treats a falsy read as "skip this item", which leaves stored state untouched.
  assertEquals(await read(null, 404), '');
});

Deno.test("github source follows GitHub's designated latest under the '@latest' suffix", async () => {
  // pnpm published v12.0.0 as a full release but left v11.24.0 designated, so this waits for the
  // promotion even under a source whose track is 'highest'.
  const plugin = source(['pnpm/pnpm@latest'], 'highest');

  const fetchStub = mock.stub(
    globalThis,
    'fetch',
    (input: string | URL | Request) => {
      assertEquals(String(input), 'https://api.github.com/repos/pnpm/pnpm/releases/latest');
      return Promise.resolve(new Response(JSON.stringify({ tag_name: 'v11.24.0' })));
    },
  );

  try {
    assertEquals(await plugin.read('pnpm/pnpm@latest'), 'v11.24.0');
  } finally {
    fetchStub.restore();
  }
});

Deno.test('github source names the track only when an item leaves the designated latest', () => {
  const plugin = source(['pestphp/pest@highest', 'pnpm/pnpm']);

  assertEquals(
    plugin.message('v5.0.1', 'v5.0.2', 'pestphp/pest@highest'),
    'pestphp/pest (highest): new release v5.0.2 (was v5.0.1)',
  );
  assertEquals(
    plugin.message('', 'v11.24.0', 'pnpm/pnpm'),
    'pnpm/pnpm: first seen release is v11.24.0',
  );
});

Deno.test('github source follows the designated latest by default', async () => {
  const plugin = source(['pnpm/pnpm']);
  const fetchStub = mock.stub(
    globalThis,
    'fetch',
    (input: string | URL | Request) => {
      assertEquals(String(input), 'https://api.github.com/repos/pnpm/pnpm/releases/latest');
      return Promise.resolve(new Response(JSON.stringify({ tag_name: 'v11.24.0' })));
    },
  );

  try {
    assertEquals(await plugin.read('pnpm/pnpm'), 'v11.24.0');
  } finally {
    fetchStub.restore();
  }
});

Deno.test('github source lets an item opt out of the source-level track', async () => {
  // The default still needs a way to say "this one project backports", per-item.
  const plugin = source(['pestphp/pest@highest']);
  const fetchStub = stubReleases([{ tag_name: 'v4.7.7' }, { tag_name: 'v5.0.2' }]);

  try {
    assertEquals(await plugin.read('pestphp/pest@highest'), 'v5.0.2');
  } finally {
    fetchStub.restore();
  }
});

Deno.test('github source rejects an item that is not owner/repo', () => {
  const schema = new GithubSource().getSchema();

  assertEquals(schema.safeParse({ items: ['owner/repo', 'owner/repo@latest', 'a/b@highest'] }).success, true);
  assertEquals(schema.safeParse({ items: ['owner/repo@next'] }).success, false);
  assertEquals(schema.safeParse({ items: ['not-a-repo'] }).success, false);
});

Deno.test('github source defaults the track to latest and rejects an unknown one', () => {
  const schema = new GithubSource().getSchema();

  assertEquals(schema.parse({ items: ['owner/repo'] }).track, 'latest');
  assertEquals(schema.safeParse({ items: ['owner/repo'], track: 'newest' }).success, false);
});
