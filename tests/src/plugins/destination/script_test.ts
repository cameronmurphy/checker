import ScriptDestination from '../../../../src/plugins/destination/script.ts';
import { assertEquals, assertStringIncludes } from '@std/assert';

type Overrides = Partial<{
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeout: number;
}>;

function destination(command: string, overrides: Overrides = {}): ScriptDestination {
  const plugin = new ScriptDestination();
  plugin.setConfig({ command, args: [], env: {}, timeout: 900, ...overrides });
  return plugin;
}

// A script that records what it was handed, so the assertions can read it back.
async function recorder(body: string): Promise<{ dir: string; path: string; output: string }> {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/script.sh`;
  const output = `${dir}/output.txt`;

  await Deno.writeTextFile(path, `#!/bin/sh\n${body.replaceAll('{{output}}', output)}\n`);
  await Deno.chmod(path, 0o755);

  return { dir, path, output };
}

Deno.test('script destination passes the message on stdin', async () => {
  const { dir, path, output } = await recorder('cat > {{output}}');

  try {
    assertEquals(await destination(path).notify('VirtualBox 7.2.4, was 7.2.2\nsecond line'), true);
    assertEquals(await Deno.readTextFile(output), 'VirtualBox 7.2.4, was 7.2.2\nsecond line\n');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('script destination exposes the message and the destination name in the environment', async () => {
  const { dir, path, output } = await recorder('printf "%s|%s" "$CHECKER_MESSAGE" "$CHECKER_DESTINATION" > {{output}}');

  try {
    const plugin = destination(path).setAlias('vbox_upgrade');

    assertEquals(await plugin.notify('an update'), true);
    assertEquals(await Deno.readTextFile(output), 'an update|vbox_upgrade');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('script destination substitutes {{message}} into the arguments', async () => {
  const { dir, path, output } = await recorder('printf "%s" "$1" > {{output}}');

  try {
    const plugin = destination(path, { args: ['--note={{message}}'] });

    assertEquals(await plugin.notify('an update'), true);
    assertEquals(await Deno.readTextFile(output), '--note=an update');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('script destination delivers when the script exits without draining stdin', async () => {
  const { dir, path, output } = await recorder('printf "%s" "$CHECKER_DESTINATION" > {{output}}');

  try {
    // A script reading $CHECKER_MESSAGE never touches the pipe, so a message too big to sit in the
    // buffer leaves the write unfinished when the script exits. That is BrokenPipe, not a failure.
    // The size has a ceiling as well as a floor: over the 64KB pipe buffer, but under the 128KB
    // Linux allows one environment string, since the message is handed over that way too.
    const plugin = destination(path).setAlias('vbox_upgrade');

    assertEquals(await plugin.notify('an update\n'.repeat(9_000)), true);
    assertEquals(await Deno.readTextFile(output), 'vbox_upgrade');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('script destination passes configured environment variables through', async () => {
  const { dir, path, output } = await recorder('printf "%s" "$UPGRADE_MODE" > {{output}}');

  try {
    const plugin = destination(path, { env: { UPGRADE_MODE: 'headless' } });

    assertEquals(await plugin.notify('an update'), true);
    assertEquals(await Deno.readTextFile(output), 'headless');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('script destination rejects the update when the script exits non-zero', async () => {
  const { dir, path } = await recorder('echo "could not reach download.virtualbox.org" >&2; exit 3');

  try {
    // False leaves the source's stored value alone, so the next check hands the script the same
    // update again rather than losing the upgrade.
    assertEquals(await destination(path).notify('an update'), false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('script destination reports a missing command rather than throwing', async () => {
  assertEquals(await destination('/definitely/not/a/command').notify('an update'), false);
});

Deno.test('script destination kills a script that outruns its timeout', async () => {
  const { dir, path, output } = await recorder('sleep 30; echo finished > {{output}}');

  try {
    assertEquals(await destination(path, { timeout: 1 }).notify('an update'), false);

    // Killed, not merely abandoned: the daemon would otherwise accumulate a stuck child per check.
    await Deno.stat(output).then(() => {
      throw new Error('the script ran to completion');
    }, () => {});
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('script destination runs the script in the configured directory', async () => {
  const { dir, path, output } = await recorder('pwd > {{output}}');
  const cwd = await Deno.makeTempDir();

  try {
    assertEquals(await destination(path, { cwd }).notify('an update'), true);
    assertStringIncludes(await Deno.readTextFile(output), await Deno.realPath(cwd));
  } finally {
    await Deno.remove(dir, { recursive: true });
    await Deno.remove(cwd, { recursive: true });
  }
});
