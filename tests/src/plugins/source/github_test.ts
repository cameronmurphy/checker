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

async function read(releases: Release[] | null, status = 200): Promise<string> {
  const source = new GithubSource();
  source.setConfig({ interval: 3600, items: ['owner/repo'] });

  const fetchStub = stubReleases(releases, status);

  try {
    return await source.read('owner/repo');
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
