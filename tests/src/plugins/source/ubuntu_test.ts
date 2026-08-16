import { UbuntuSource } from '../../../../src/plugins/source/ubuntu.ts';
import * as mock from '@std/testing/mock';
import { assertEquals, assertStringIncludes } from '@std/assert';

type Published = { version: string; pocket: string };

function source(items: string[], options: { archive?: string; series?: string } = {}): UbuntuSource {
  const plugin = new UbuntuSource();
  plugin.setConfig({ interval: 3600, items, archive: options.archive ?? 'ubuntu', series: options.series });
  return plugin;
}

function sources(published: Published[]): Response {
  const entries = published.map(({ version, pocket }) => ({
    source_package_name: 'php8.5',
    source_package_version: version,
    pocket,
  }));

  return new Response(JSON.stringify({ total_size: entries.length, entries }), { status: 200 });
}

async function read(
  item: string,
  response: () => Response,
  options: { archive?: string; series?: string } = {},
): Promise<{ value: string; url: string; errors: string[] }> {
  const plugin = source([item], options);
  const errors: string[] = [];
  let url = '';

  const fetchStub = mock.stub(globalThis, 'fetch', (input: string | URL | Request) => {
    url = String(input);
    return Promise.resolve(response());
  });
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    return { value: await plugin.read(item), url, errors };
  } finally {
    fetchStub.restore();
    errorStub.restore();
  }
}

Deno.test('ubuntu source reads the published version for a series', async () => {
  const { value, url } = await read(
    'php8.3',
    () => sources([{ version: '8.3.6-0ubuntu0.24.04.10', pocket: 'Release' }]),
    { series: 'noble' },
  );

  assertEquals(value, '8.3.6-0ubuntu0.24.04.10');
  assertStringIncludes(url, 'https://api.launchpad.net/1.0/ubuntu/+archive/primary?');
  assertStringIncludes(url, 'source_name=php8.3');
  assertStringIncludes(url, 'exact_match=true');
  assertStringIncludes(url, 'status=Published');
  assertStringIncludes(url, 'distro_series=https%3A%2F%2Fapi.launchpad.net%2F1.0%2Fubuntu%2Fnoble');
});

Deno.test('ubuntu source takes the highest version across pockets', async () => {
  // A package's release, its security update and the -updates copy all come back as separate
  // publications, and apt installs the highest. Taking the first entry would report the two-year-old
  // release as the current version.
  const { value } = await read('php8.3', () =>
    sources([
      { version: '8.3.6-0maysync1', pocket: 'Release' },
      { version: '8.3.6-0ubuntu0.24.04.10', pocket: 'Updates' },
      { version: '8.3.6-0ubuntu0.24.04.9', pocket: 'Security' },
    ]), { series: 'noble' });

  assertEquals(value, '8.3.6-0ubuntu0.24.04.10');
});

Deno.test('ubuntu source ignores pockets a stock machine has switched off', async () => {
  const { value } = await read('php8.3', () =>
    sources([
      { version: '8.3.6-0ubuntu0.24.04.10', pocket: 'Updates' },
      { version: '8.4.0-1ubuntu1', pocket: 'Proposed' },
      { version: '8.4.1-1~bpo24.04.1', pocket: 'Backports' },
    ]), { series: 'noble' });

  assertEquals(value, '8.3.6-0ubuntu0.24.04.10');
});

Deno.test('ubuntu source queries a PPA the way add-apt-repository names it', async () => {
  const { value, url } = await read(
    'php8.5',
    () => sources([{ version: '8.5.9-1+ubuntu24.04.1+deb.sury.org+1', pocket: 'Release' }]),
    { archive: 'ppa:ondrej/php', series: 'noble' },
  );

  assertEquals(value, '8.5.9-1+ubuntu24.04.1+deb.sury.org+1');
  assertStringIncludes(url, 'https://api.launchpad.net/1.0/~ondrej/+archive/ubuntu/php?');
});

Deno.test('ubuntu source lets an item name its own series, as apt does', async () => {
  const { url } = await read(
    'php8.5/jammy',
    () => sources([{ version: '8.5.9-1+ubuntu22.04.1+deb.sury.org+1', pocket: 'Release' }]),
    { archive: 'ppa:ondrej/php', series: 'noble' },
  );

  assertStringIncludes(url, 'source_name=php8.5');
  assertStringIncludes(url, '%2Fubuntu%2Fjammy');
});

Deno.test('ubuntu source says which series it has no series for', async () => {
  const { value, errors } = await read('php8.5', () => sources([]));

  assertEquals(value, '');
  assertEquals(errors, ["php8.5: no Ubuntu series to check. Set 'series' on the source, or write 'php8.5/noble'"]);
});

Deno.test('ubuntu source points at source package names when nothing is published', async () => {
  // An archive and a series that both exist answer 200 with an empty list, so the usual mistake — a
  // binary package name like php8.5-fpm — looks exactly like a package that hasn't landed yet.
  const { value, errors } = await read('php8.5-fpm', () => sources([]), { series: 'noble' });

  assertEquals(value, '');
  assertStringIncludes(errors[0], 'php8.5-fpm (noble): nothing published');
  assertStringIncludes(errors[0], "'php8.5' rather than 'php8.5-fpm'");
});

Deno.test('ubuntu source returns nothing when Launchpad refuses the request', async () => {
  // A series that doesn't exist is a 400 and a PPA that doesn't is a 404, so the label carries both.
  const { value, errors } = await read(
    'php8.5',
    () => new Response('', { status: 404, statusText: 'Not Found' }),
    { archive: 'ppa:ondrej/nosuchppa', series: 'noble' },
  );

  assertEquals(value, '');
  assertEquals(errors, ['Failed to look up php8.5 (noble, ppa:ondrej/nosuchppa): Not Found']);
});

Deno.test('ubuntu source names where a version came from in its messages', () => {
  const ppa = source(['php8.5'], { archive: 'ppa:ondrej/php', series: 'noble' });

  assertEquals(
    ppa.message('8.5.4-1+ubuntu24.04.1+deb.sury.org+1', '8.5.9-1+ubuntu24.04.1+deb.sury.org+1', 'php8.5'),
    'php8.5 (noble, ppa:ondrej/php): new version 8.5.9-1+ubuntu24.04.1+deb.sury.org+1 ' +
      '(was 8.5.4-1+ubuntu24.04.1+deb.sury.org+1)',
  );
  assertEquals(
    ppa.message('', '8.5.9-1+ubuntu24.04.1+deb.sury.org+1', 'php8.5'),
    'php8.5 (noble, ppa:ondrej/php): first seen version is 8.5.9-1+ubuntu24.04.1+deb.sury.org+1',
  );

  // The distribution's own archive is the default, so saying so in every notification is noise.
  const primary = source(['php8.3'], { series: 'noble' });

  assertEquals(
    primary.message('8.3.6-0ubuntu0.24.04.9', '8.3.6-0ubuntu0.24.04.10', 'php8.3'),
    'php8.3 (noble): new version 8.3.6-0ubuntu0.24.04.10 (was 8.3.6-0ubuntu0.24.04.9)',
  );
});

Deno.test('ubuntu source only reports an upgrade as an update', () => {
  const plugin = source(['php8.5']);

  assertEquals(plugin.updated('8.5.4-1+ubuntu24.04.1', '8.5.9-1+ubuntu24.04.1'), true);
  assertEquals(plugin.updated('8.3.6-0ubuntu0.24.04.9', '8.3.6-0ubuntu0.24.04.10'), true);
  // A package pulled from the archive leaves the previous publication as the highest, and a
  // notification saying the version went backwards isn't one you can act on.
  assertEquals(plugin.updated('8.5.9-1+ubuntu24.04.1', '8.5.4-1+ubuntu24.04.1'), false);
});

Deno.test('ubuntu source rejects an archive that is neither the distribution nor a PPA', () => {
  const schema = new UbuntuSource().getSchema();

  assertEquals(schema.safeParse({ items: ['php8.5'], archive: 'ppa:ondrej' }).success, false);
  assertEquals(schema.safeParse({ items: ['php8.5'], archive: 'ondrej/php' }).success, false);
  assertEquals(schema.safeParse({ items: ['php8.5'], archive: 'ppa:ondrej/php' }).success, true);
  assertEquals(schema.safeParse({ items: ['php8.5'] }).data?.archive, 'ubuntu');
});
