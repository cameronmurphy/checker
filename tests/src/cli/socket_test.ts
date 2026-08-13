import { listen, NoDaemonError, type Reply, send, socketPath } from '../../../src/cli/socket.ts';
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { join } from '@std/path';

async function withDaemon(
  handle: (command: string) => Promise<Reply>,
  body: (configFile: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir();
  const configFile = join(dir, 'config.yml');
  const listener = await listen(configFile, handle);

  try {
    await body(configFile);
  } finally {
    listener?.close();
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

Deno.test('the socket sits beside the config file, so two configs get two sockets', () => {
  assertEquals(socketPath('/etc/checker/config.yml'), '/etc/checker/checker.sock');
  assertStringIncludes(socketPath('~/.config/checker/config.yml'), '/.config/checker/checker.sock');
});

Deno.test('a config too deeply nested to hold a socket still gets its own', () => {
  const deep = `/${'nested/'.repeat(20)}config.yml`;
  const path = socketPath(deep);

  // Binding fails outright above SUN_LEN, so the fallback has to be short and still per-config.
  assertEquals(path.startsWith('/tmp/checker-'), true);
  assertEquals(path.length < 90, true);
  assertEquals(path === socketPath(deep), true);
  assertEquals(path === socketPath(`/${'other/'.repeat(20)}config.yml`), false);
});

Deno.test('a command reaches the daemon and its reply reaches the caller', async () => {
  await withDaemon(
    (command) => Promise.resolve({ ok: true, message: `handled ${command}` }),
    async (configFile) => {
      assertEquals(await send(configFile, 'self-update'), { ok: true, message: 'handled self-update' });
    },
  );
});

Deno.test('a handler that throws answers with the failure rather than closing the connection', async () => {
  await withDaemon(
    () => Promise.reject(new Error('the release could not be reached')),
    async (configFile) => {
      const reply = await send(configFile, 'self-update');

      assertEquals(reply.ok, false);
      assertEquals(reply.message, 'the release could not be reached');
    },
  );
});

Deno.test('talking to a config with no daemon behind it says so, in a way the CLI can act on', async () => {
  const dir = await Deno.makeTempDir();

  try {
    // Its own type, so `self-update` can tell "nothing to ask" apart from "the daemon said no".
    await assertRejects(
      () => send(join(dir, 'config.yml'), 'self-update'),
      NoDaemonError,
      'No checker is running',
    );
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
});

Deno.test('a socket left behind by an unclean shutdown is taken over, not refused', async () => {
  const dir = await Deno.makeTempDir();
  const configFile = join(dir, 'config.yml');

  // A file at the socket path that nothing is listening on is what a killed daemon leaves.
  await Deno.writeTextFile(join(dir, 'checker.sock'), '');

  const listener = await listen(configFile, () => Promise.resolve({ ok: true, message: 'alive' }));

  try {
    assertEquals(listener === null, false);
    assertEquals((await send(configFile, 'anything')).message, 'alive');
  } finally {
    listener?.close();
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
});

Deno.test('a second daemon leaves the first one holding the socket', async () => {
  await withDaemon(
    () => Promise.resolve({ ok: true, message: 'first' }),
    async (configFile) => {
      const second = await listen(configFile, () => Promise.resolve({ ok: true, message: 'second' }));

      assertEquals(second, null);
      assertEquals((await send(configFile, 'anything')).message, 'first');
    },
  );
});
