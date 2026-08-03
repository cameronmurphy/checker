import LogFileDestination from '../../../../src/plugins/destination/log-file.ts';
import { assertEquals, assertStringIncludes } from '@std/assert';

function destination(path: string): LogFileDestination {
  const plugin = new LogFileDestination();
  plugin.setConfig({ path });
  return plugin;
}

Deno.test('log file destination appends rather than overwriting', async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/checker.log`;

  try {
    const plugin = destination(path);

    assertEquals(await plugin.notify('first update'), true);
    assertEquals(await plugin.notify('second update'), true);

    const lines = (await Deno.readTextFile(path)).trim().split('\n');
    assertEquals(lines.length, 2);
    assertStringIncludes(lines[0], 'first update');
    assertStringIncludes(lines[1], 'second update');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('log file destination writes one greppable line per notification', async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/checker.log`;

  try {
    // Several sources report over multiple lines.
    await destination(path).notify('Elastic Beanstalk PHP platform updated\nLanguage: PHP 8.5.8\nProxy: nginx');

    const contents = (await Deno.readTextFile(path)).trim();
    assertEquals(contents.split('\n').length, 1);
    assertStringIncludes(contents, 'Elastic Beanstalk PHP platform updated Language: PHP 8.5.8 Proxy: nginx');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('log file destination creates missing parent directories', async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/nested/deeper/checker.log`;

  try {
    assertEquals(await destination(path).notify('made the directory'), true);
    assertStringIncludes(await Deno.readTextFile(path), 'made the directory');
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('log file destination reports failure rather than throwing', async () => {
  const dir = await Deno.makeTempDir();

  try {
    // The path is a directory, so the write cannot succeed. Returning false leaves the source's
    // stored value alone so the next check retries.
    assertEquals(await destination(dir).notify('nope'), false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
