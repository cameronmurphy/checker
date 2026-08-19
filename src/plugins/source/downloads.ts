import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import { describeError } from '../../utils/format.ts';
import { expand } from '../../utils/path.ts';
import { join } from '@std/path/join';
import { z } from 'zod';

// Chrome writes a download to '<final name>.crdownload' and renames it on completion, so a name
// leaving the set is a download that ended rather than one still running.
const PARTIAL = '.crdownload';

// Pushover refuses a message over 1024 characters, and a browser working through a queue of thirty
// would otherwise name every one of them.
const LIST_BUDGET = 700;

const DownloadsConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.string()).min(1, 'Downloads plugin requires at least one directory').default(['~/Downloads']),
  notify_per_file: z.boolean().default(true),
  notify_queue_empty: z.boolean().default(true),
  // A download finishes in minutes, and the check is a local directory walk rather than a request
  // to anyone, so the hourly default every other source wants would report the file long after it
  // was usable.
  interval: z.number().default(30),
}).check((ctx) => {
  if (ctx.value.notify_per_file || ctx.value.notify_queue_empty) return;

  ctx.issues.push({
    code: 'custom',
    input: ctx.value,
    message: 'Downloads plugin has notify_per_file and notify_queue_empty both off, so it would never notify',
  });
});

type DownloadsConfig = z.infer<typeof DownloadsConfigSchema>;

type Finished = { name: string; size: number | null };

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
}

function describeFile({ name, size }: Finished): string {
  return size === null ? name : `${name} (${formatSize(size)})`;
}

function summarise(finished: Finished[]): string[] {
  const kept: string[] = [];
  let budget = LIST_BUDGET;

  for (const file of finished) {
    const line = `• ${describeFile(file)}`;

    if (line.length > budget) break;

    kept.push(line);
    budget -= line.length + 1;
  }

  const dropped = finished.length - kept.length;

  return dropped > 0 ? [...kept, `• …and ${dropped} more`] : kept;
}

export class DownloadsSource extends BaseSourcePlugin<DownloadsConfig> {
  // What the last scan of each directory saw. This can't live in the stored state: checker writes
  // that only when a check notifies, and most scans of a folder mid-download have nothing to say —
  // the queue growing by three files is not news, but it is what the next completion is measured
  // against.
  private readonly pending = new Map<string, Set<string>>();

  public override getSchema() {
    return DownloadsConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const root = expand(item);
    let current: Set<string>;

    try {
      current = await this.scan(root);
    } catch (error) {
      console.error(`Failed to scan ${item} for downloads: ${describeError(error)}`);
      return '';
    }

    const previous = this.pending.get(item);
    this.pending.set(item, current);

    // Nothing to compare a first scan against. Reporting whatever the folder held at startup would
    // announce downloads that finished while checker wasn't running, or ones still going.
    if (!previous) return '';

    const { notify_per_file, notify_queue_empty } = this.getConfig();
    const gone = [...previous].filter((name) => !current.has(name)).sort();
    const drained = previous.size > 0 && current.size === 0;

    if (!(notify_per_file && gone.length > 0) && !(notify_queue_empty && drained)) return '';

    const finished = await Promise.all(gone.map((name) => this.describeCompleted(root, name)));

    // The report is the value. There's no version here to compare against next time, and keeping
    // the text checker sent leaves the stored state readable as the log of notifications it is.
    return this.report(finished, current.size, drained, item);
  }

  // read() answers with a report only when something finished, so there is nothing left to decide.
  // Two identical batches in a row — the same file downloaded, deleted, and downloaded again — are
  // two downloads and two notifications.
  public override updated(_before: string, after: string): boolean {
    return after !== '';
  }

  public override message(_before: string, after: string, _item: string): string {
    return after;
  }

  private report(finished: Finished[], remaining: number, drained: boolean, item: string): string {
    const { notify_per_file, notify_queue_empty, items } = this.getConfig();
    const lines: string[] = [];

    if (notify_per_file && finished.length === 1) {
      lines.push(`${describeFile(finished[0])} finished downloading`);
    } else if (notify_per_file && finished.length > 1) {
      lines.push(`${finished.length} downloads finished:`, ...summarise(finished));
    }

    if (notify_queue_empty && drained) {
      lines.push('All files have finished downloading');
    } else if (remaining > 0) {
      lines.push(`${remaining} still downloading`);
    }

    // Only worth naming the folder when the config watches more than one, since otherwise every
    // notification carries the same '~/Downloads'.
    return items.length > 1 ? [`${item}:`, ...lines].join('\n') : lines.join('\n');
  }

  // Only the folder itself. A browser writes its partial file into the folder it was pointed at, so
  // there is nothing below to find — and a download folder can be the root of a volume, where
  // descending would mean thousands of directories that have nothing to do with downloads.
  private async scan(root: string): Promise<Set<string>> {
    const names = new Set<string>();

    for await (const entry of Deno.readDir(root)) {
      if (entry.isFile && entry.name.endsWith(PARTIAL)) names.add(entry.name);
    }

    return names;
  }

  // A partial file that vanished was either renamed to its final name or cancelled, and Chrome
  // deletes it either way. Both count as leaving the queue; the size is there when the finished
  // file is, which also covers the 'Unconfirmed 123456.crdownload' names Chrome falls back to when
  // it can't work out the filename up front.
  private async describeCompleted(root: string, name: string): Promise<Finished> {
    const final = name.slice(0, -PARTIAL.length);

    try {
      const { size } = await Deno.stat(join(root, final));

      return { name: final, size };
    } catch {
      return { name: final, size: null };
    }
  }
}
