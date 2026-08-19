import { DownloadsSource } from '../../../../src/plugins/source/downloads.ts';
import * as mock from '@std/testing/mock';
import { assert, assertEquals, assertStringIncludes } from '@std/assert';

type Options = { notify_per_file?: boolean; notify_queue_empty?: boolean; extra?: string[] };

function source(dir: string, options: Options = {}): DownloadsSource {
  const plugin = new DownloadsSource();

  plugin.setConfig({
    interval: 30,
    items: [dir, ...(options.extra ?? [])],
    notify_per_file: options.notify_per_file ?? true,
    notify_queue_empty: options.notify_queue_empty ?? true,
  });

  return plugin;
}

async function partial(dir: string, name: string): Promise<void> {
  await Deno.writeFile(`${dir}/${name}.crdownload`, new Uint8Array(8));
}

/** The rename Chrome does when a download completes, with the finished file at its real size. */
async function complete(dir: string, name: string, size = 1024): Promise<void> {
  await Deno.remove(`${dir}/${name}.crdownload`);
  // Truncated to length rather than written, so a test can name an ISO-sized file without
  // allocating one.
  const file = await Deno.create(`${dir}/${name}`);

  await file.truncate(size);
  file.close();
}

async function withFolder(test: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: 'checker-downloads-' });

  try {
    await test(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test('downloads source says nothing about what was already in the folder', async () => {
  await withFolder(async (dir) => {
    await partial(dir, 'already-going.iso');

    const plugin = source(dir);

    // The first scan is a restart adopting whatever is there. Anything that finished while checker
    // was down is gone by now, and what's left is still running.
    assertEquals(await plugin.read(dir), '');
    assertEquals(await plugin.read(dir), '');
  });
});

Deno.test('downloads source stays quiet while the queue only grows', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir);
    await plugin.read(dir);

    await partial(dir, 'a.zip');
    assertEquals(await plugin.read(dir), '');

    await partial(dir, 'b.zip');
    await partial(dir, 'c.zip');
    assertEquals(await plugin.read(dir), '');
  });
});

Deno.test('downloads source names each file as it finishes, with its size and what is left', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir);
    await plugin.read(dir);

    await partial(dir, 'notes.pdf');
    await partial(dir, 'clip.mp4');
    await plugin.read(dir);

    await complete(dir, 'notes.pdf', 812_345);

    assertEquals(await plugin.read(dir), 'notes.pdf (793.3 KB) finished downloading\n1 still downloading');
  });
});

Deno.test('downloads source reports a file whose finished copy it cannot find, without inventing a size', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir);
    await plugin.read(dir);

    await partial(dir, 'clip.mp4');
    await partial(dir, 'held.zip');
    await plugin.read(dir);

    // A cancelled download and one of Chrome's 'Unconfirmed 123456.crdownload' names look the same
    // from here: the partial file is gone and there's nothing to size.
    await Deno.remove(`${dir}/clip.mp4.crdownload`);

    assertEquals(await plugin.read(dir), 'clip.mp4 finished downloading\n1 still downloading');
  });
});

Deno.test('downloads source announces the queue draining alongside the file that emptied it', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir);
    await plugin.read(dir);

    await partial(dir, 'last.iso');
    await plugin.read(dir);

    await complete(dir, 'last.iso', 5_600_000_000);

    assertEquals(
      await plugin.read(dir),
      'last.iso (5.2 GB) finished downloading\nAll files have finished downloading',
    );
  });
});

Deno.test('downloads source gathers everything that finished in one interval into one message', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir);
    await plugin.read(dir);

    await partial(dir, 'a.zip');
    await partial(dir, 'b.zip');
    await partial(dir, 'c.zip');
    await partial(dir, 'still-going.iso');
    await plugin.read(dir);

    await complete(dir, 'a.zip', 1500);
    await complete(dir, 'b.zip', 1500);
    await complete(dir, 'c.zip', 1500);

    assertEquals(
      await plugin.read(dir),
      [
        '3 downloads finished:',
        '• a.zip (1.5 KB)',
        '• b.zip (1.5 KB)',
        '• c.zip (1.5 KB)',
        '1 still downloading',
      ].join('\n'),
    );
  });
});

Deno.test('downloads source keeps the list inside what a destination will take', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir);
    await plugin.read(dir);

    const names = Array.from({ length: 40 }, (_, index) => `a-very-long-download-name-${index}.zip`);

    for (const name of names) await partial(dir, name);
    await plugin.read(dir);
    for (const name of names) await complete(dir, name);

    const report = await plugin.read(dir);

    assertStringIncludes(report, '40 downloads finished:');
    assertStringIncludes(report, 'more');
    assertStringIncludes(report, 'All files have finished downloading');
    assert(report.length < 1024, `report was ${report.length} characters`);
  });
});

Deno.test('downloads source with notify_per_file off only reports the queue emptying', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir, { notify_per_file: false });
    await plugin.read(dir);

    await partial(dir, 'a.zip');
    await partial(dir, 'b.zip');
    await plugin.read(dir);

    await complete(dir, 'a.zip');
    assertEquals(await plugin.read(dir), '');

    await complete(dir, 'b.zip');
    assertEquals(await plugin.read(dir), 'All files have finished downloading');
  });
});

Deno.test('downloads source with notify_queue_empty off stops at the last file', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir, { notify_queue_empty: false });
    await plugin.read(dir);

    await partial(dir, 'a.zip');
    await plugin.read(dir);

    await complete(dir, 'a.zip');

    assertEquals(await plugin.read(dir), 'a.zip (1.0 KB) finished downloading');
  });
});

Deno.test('downloads source names the folder once more than one is watched', async () => {
  await withFolder(async (dir) => {
    const plugin = source(dir, { extra: ['~/Downloads'] });
    await plugin.read(dir);

    await partial(dir, 'a.zip');
    await plugin.read(dir);

    await complete(dir, 'a.zip');

    assertEquals(
      await plugin.read(dir),
      `${dir}:\na.zip (1.0 KB) finished downloading\nAll files have finished downloading`,
    );
  });
});

Deno.test('downloads source looks in the folder it was given and nowhere below it', async () => {
  await withFolder(async (dir) => {
    // What the root of a volume looks like: system directories macOS opens for nobody, and folders
    // full of things that are not downloads. Descending into any of it is wasted work at best, and
    // the read that fails takes the whole scan with it at worst.
    await Deno.mkdir(`${dir}/.DocumentRevisions-V100`);
    await Deno.chmod(`${dir}/.DocumentRevisions-V100`, 0o000);
    await Deno.mkdir(`${dir}/TV Shows`);
    await Deno.writeFile(`${dir}/TV Shows/episode.mkv.crdownload`, new Uint8Array(8));

    try {
      const plugin = source(dir);
      await plugin.read(dir);

      await partial(dir, 'takeout-001.tgz');
      await plugin.read(dir);

      await complete(dir, 'takeout-001.tgz');

      // The partial file a level down was never in the queue, so emptying it of the one that was
      // drains it.
      assertEquals(
        await plugin.read(dir),
        'takeout-001.tgz (1.0 KB) finished downloading\nAll files have finished downloading',
      );
    } finally {
      await Deno.chmod(`${dir}/.DocumentRevisions-V100`, 0o700);
    }
  });
});

Deno.test('downloads source reports a folder it cannot read and leaves the state alone', async () => {
  const plugin = source('/no/such/downloads/folder');
  const errors: string[] = [];
  const errorStub = mock.stub(console, 'error', (...args: unknown[]) => void errors.push(String(args[0])));

  try {
    assertEquals(await plugin.read('/no/such/downloads/folder'), '');
  } finally {
    errorStub.restore();
  }

  assertEquals(errors.length, 1);
  assertStringIncludes(errors[0], 'Failed to scan /no/such/downloads/folder for downloads');
});

Deno.test('downloads source only counts a report as an update', () => {
  const plugin = source('/tmp');

  assertEquals(plugin.updated('', 'a.zip finished downloading'), true);

  // The same batch twice over is the same file downloaded, deleted and downloaded again, which is
  // two downloads and two notifications.
  assertEquals(plugin.updated('a.zip finished downloading', 'a.zip finished downloading'), true);
  assertEquals(plugin.updated('a.zip finished downloading', ''), false);
});

Deno.test('downloads source watches ~/Downloads every half minute unless told otherwise', () => {
  const parsed = new DownloadsSource().getSchema().parse({});

  assertEquals(parsed.items, ['~/Downloads']);
  assertEquals(parsed.interval, 30);
  assertEquals(parsed.notify_per_file, true);
  assertEquals(parsed.notify_queue_empty, true);
});

Deno.test('downloads source refuses a config that could never notify', () => {
  const schema = new DownloadsSource().getSchema();

  const both = schema.safeParse({ notify_per_file: false, notify_queue_empty: false });
  assertEquals(both.success, false);
  assertStringIncludes(both.error?.issues[0].message ?? '', 'would never notify');

  const none = schema.safeParse({ items: [] });
  assertEquals(none.success, false);
  assertStringIncludes(none.error?.issues[0].message ?? '', 'at least one directory');
});
