import { VirtualboxSource } from '../../../../src/plugins/source/virtualbox.ts';
import * as mock from '@std/testing/mock';
import { assertEquals, assertStringIncludes } from '@std/assert';

function page(body: string): string {
  return `<html><body><div id="wikipage">${body}</div></body></html>`;
}

const CHANGELOG = page(`
  <p><strong>VirtualBox 7.2.16</strong> (released August 18 2026)</p>
  <ul><li>GUI: Updated Catalan translations</li><li>Host: OpenSSL 4.0 build fixes</li></ul>
  <p><strong>VirtualBox 7.2.14</strong> (released July 10 2026)</p>
  <ul><li>Graphics: VMSVGA 3D performance improvements</li></ul>
`);

function source(items: string[] = ['latest']): VirtualboxSource {
  const plugin = new VirtualboxSource();
  plugin.setConfig({ interval: 3600, items });
  return plugin;
}

async function read(item: string, body: string, status = 200): Promise<{ value: string; url: string }> {
  const plugin = source([item]);
  let url = '';
  const fetchStub = mock.stub(globalThis, 'fetch', (input: string | URL | Request) => {
    url = String(input);
    return Promise.resolve(new Response(body, { status }));
  });

  try {
    return { value: await plugin.read(item), url };
  } finally {
    fetchStub.restore();
  }
}

Deno.test('virtualbox source reports the highest version on the page', async () => {
  const { value } = await read('latest', CHANGELOG);

  assertEquals(value, '7.2.16');
});

Deno.test('virtualbox source takes the highest version, not the topmost', async () => {
  // The page is written newest first by convention, not guarantee. A branch page that picked up an
  // older backport at the top would otherwise be reported as a downgrade.
  const { value } = await read(
    'latest',
    page(`
      <p><strong>VirtualBox 7.1.4</strong> (released August 1 2026)</p>
      <ul><li>A backport</li></ul>
      <p><strong>VirtualBox 7.2.16</strong> (released August 18 2026)</p>
      <ul><li>The actual latest</li></ul>
    `),
  );

  assertEquals(value, '7.2.16');
});

Deno.test('virtualbox source ignores betas and release candidates', async () => {
  const { value } = await read(
    'latest',
    page(`
      <p><strong>VirtualBox 7.3.0 BETA1</strong> (released August 20 2026)</p>
      <ul><li>Nothing to install yet</li></ul>
      <p><strong>VirtualBox 7.2.16</strong> (released August 18 2026)</p>
      <ul><li>A real release</li></ul>
    `),
  );

  assertEquals(value, '7.2.16');
});

Deno.test('virtualbox source follows the current branch for latest, and a suffixed page otherwise', async () => {
  assertEquals((await read('latest', CHANGELOG)).url, 'https://www.virtualbox.org/wiki/Changelog');
  assertEquals((await read('7.1', CHANGELOG)).url, 'https://www.virtualbox.org/wiki/Changelog-7.1');
});

Deno.test('virtualbox source only reports an upgrade as an update', () => {
  const plugin = source();

  assertEquals(plugin.updated('7.2.14', '7.2.16'), true);
  assertEquals(plugin.updated('7.2.16', '7.2.14'), false);
  assertEquals(plugin.updated('7.2.16', '7.2.16'), false);
});

Deno.test('virtualbox source reports the release date and what changed', async () => {
  const plugin = source();
  const fetchStub = mock.stub(globalThis, 'fetch', () => Promise.resolve(new Response(CHANGELOG)));

  try {
    await plugin.read('latest');
  } finally {
    fetchStub.restore();
  }

  const message = plugin.message('7.2.14', '7.2.16', 'latest');

  assertStringIncludes(message, 'VirtualBox 7.2.16 (released August 18 2026), was 7.2.14');
  assertStringIncludes(message, '• GUI: Updated Catalan translations');
  assertStringIncludes(message, '• Host: OpenSSL 4.0 build fixes');
  assertStringIncludes(message, 'https://www.virtualbox.org/wiki/Changelog');
});

Deno.test('virtualbox source says so when a version is seen for the first time', () => {
  assertStringIncludes(source().message('', '7.2.16', 'latest'), 'first seen version is 7.2.16');
});

Deno.test('virtualbox source counts the notes it drops rather than overrunning the destination', async () => {
  // Pushover rejects anything over 1024 characters, and a maintenance release routinely lists
  // twenty entries.
  const notes = Array.from({ length: 30 }, (_, index) => `<li>Fix number ${index} ${'x'.repeat(60)}</li>`).join('');
  const plugin = source();
  const fetchStub = mock.stub(
    globalThis,
    'fetch',
    () =>
      Promise.resolve(
        new Response(page(`<p><strong>VirtualBox 7.2.16</strong> (released August 18 2026)</p><ul>${notes}</ul>`)),
      ),
  );

  try {
    await plugin.read('latest');
  } finally {
    fetchStub.restore();
  }

  const message = plugin.message('7.2.14', '7.2.16', 'latest');

  assertStringIncludes(message, 'more');
  assertEquals(message.length < 1024, true);
});

Deno.test('virtualbox source returns nothing when the changelog cannot be fetched', async () => {
  assertEquals((await read('latest', 'nope', 503)).value, '');
});

Deno.test('virtualbox source returns nothing when the page lists no releases', async () => {
  assertEquals((await read('latest', page('<p>Under maintenance</p>'))).value, '');
});
