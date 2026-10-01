import { PackagistSource } from '../../../../src/plugins/source/packagist.ts';
import * as mock from '@std/testing/mock';
import { assertEquals } from '@std/assert';

// Deliberately out of order, and shaped like craftcms/cms during the 6.0 alphas: a maintained 5.x
// line alongside prereleases of the next major.
const VERSIONS = ['5.11.3', '6.0.0-alpha.18', '4.15.4', '5.11.0', '6.0.0-alpha.17', '5.10.14'];

function source(items: string[], constraint = '*'): PackagistSource {
  const plugin = new PackagistSource();
  plugin.setConfig({ interval: 3600, items, constraint });
  return plugin;
}

function metadata(name: string, versions = VERSIONS): Response {
  const releases = versions.map((version) => ({ version, version_normalized: version }));
  return new Response(JSON.stringify({ packages: { [name]: releases } }), { status: 200 });
}

async function read(item: string, response: () => Response, constraint = '*'): Promise<string> {
  const plugin = source([item], constraint);
  const fetchStub = mock.stub(globalThis, 'fetch', () => Promise.resolve(response()));

  try {
    return await plugin.read(item);
  } finally {
    fetchStub.restore();
  }
}

Deno.test('packagist source reads the p2 metadata file for the package', async () => {
  const plugin = source(['craftcms/cms']);
  const fetchStub = mock.stub(globalThis, 'fetch', (input: string | URL | Request) => {
    assertEquals(String(input), 'https://repo.packagist.org/p2/craftcms/cms.json');
    return Promise.resolve(metadata('craftcms/cms'));
  });

  try {
    assertEquals(await plugin.read('craftcms/cms'), '5.11.3');
  } finally {
    fetchStub.restore();
  }
});

Deno.test('packagist source takes the newest stable release by default', async () => {
  // The alphas are the highest versions published, and '*' must still mean 5.11.3.
  assertEquals(await read('craftcms/cms', () => metadata('craftcms/cms')), '5.11.3');
});

Deno.test('packagist source follows a single line when the item is a range', async () => {
  assertEquals(await read('craftcms/cms@^5', () => metadata('craftcms/cms')), '5.11.3');
  assertEquals(await read('craftcms/cms@~5.10.0', () => metadata('craftcms/cms')), '5.10.14');
  assertEquals(await read('craftcms/cms@^4', () => metadata('craftcms/cms')), '4.15.4');
});

Deno.test('packagist source selects prereleases only when the range asks for them', async () => {
  assertEquals(await read('craftcms/cms@^6', () => metadata('craftcms/cms')), '');
  assertEquals(await read('craftcms/cms@^6.0.0-0', () => metadata('craftcms/cms')), '6.0.0-alpha.18');
});

Deno.test('packagist source takes a range from the source-level constraint', async () => {
  assertEquals(await read('craftcms/cms', () => metadata('craftcms/cms'), '^5'), '5.11.3');
});

Deno.test('packagist source normalises a v-prefixed version', async () => {
  // Plenty of Composer packages tag 'v5.7.0'; state holds one shape either way.
  assertEquals(await read('craftcms/ckeditor@^5', () => metadata('craftcms/ckeditor', ['v5.7.0', 'v5.6.0'])), '5.7.0');
});

Deno.test('packagist source ignores versions that are not semver', async () => {
  const versions = ['dev-main', '5.11.3'];
  assertEquals(await read('craftcms/cms@^5', () => metadata('craftcms/cms', versions)), '5.11.3');
});

Deno.test('packagist source waits quietly for a range nothing satisfies yet', async () => {
  // A watch on the next major sits here indefinitely by design, and console.error reaches
  // destinations, so logging the miss would notify about every check of a range doing its job.
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(await read('craftcms/cms@^9', () => metadata('craftcms/cms')), '');
    assertEquals(errors, []);
  } finally {
    errorStub.restore();
  }
});

Deno.test('packagist source says when a suffix is not a range', async () => {
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(await read('craftcms/cms@^6x', () => metadata('craftcms/cms')), '');
    assertEquals(errors, ['craftcms/cms: "^6x" is not a valid version range']);
  } finally {
    errorStub.restore();
  }
});

Deno.test('packagist source names a package that does not exist', async () => {
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(await read('craftcms/nope@^1', () => new Response('', { status: 404 })), '');
    assertEquals(errors, ['craftcms/nope is not a package on Packagist']);
  } finally {
    errorStub.restore();
  }
});

Deno.test('packagist source returns nothing when the metadata request fails', async () => {
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(
      await read('craftcms/cms@^5', () => new Response('', { status: 503, statusText: 'Unavailable' })),
      '',
    );
    assertEquals(errors, ['Failed to fetch versions for craftcms/cms: Unavailable']);
  } finally {
    errorStub.restore();
  }
});

Deno.test('packagist source names the tracked range in its messages', () => {
  const plugin = source(['craftcms/cms@^6.0.0-0']);

  assertEquals(
    plugin.message('6.0.0-alpha.18', '6.0.0-alpha.19', 'craftcms/cms@^6.0.0-0'),
    'craftcms/cms (^6.0.0-0): new version 6.0.0-alpha.19 (was 6.0.0-alpha.18)',
  );
  assertEquals(
    plugin.message('', '6.0.0-alpha.18', 'craftcms/cms@^6.0.0-0'),
    'craftcms/cms (^6.0.0-0): first seen version is 6.0.0-alpha.18',
  );
  assertEquals(
    plugin.message('5.11.2', '5.11.3', 'craftcms/cms'),
    'craftcms/cms: new version 5.11.3 (was 5.11.2)',
  );
});

Deno.test('packagist source rejects an item that is not a vendor/package name', () => {
  const schema = new PackagistSource().getSchema();
  const result = schema.safeParse({ items: ['cms'] });

  assertEquals(result.success, false);
  assertEquals(
    result.error?.issues[0].message,
    "Packagist plugin items are written 'vendor/package', optionally suffixed '@<range>'",
  );
});
