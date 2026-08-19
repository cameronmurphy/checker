import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { DOMParser } from '@b-fuze/deno-dom';
import { z } from 'zod';

const CHANGELOG = 'https://www.virtualbox.org/wiki/Changelog';

// VirtualBox is closed source, so there are no release tags to watch. The changelog is the only
// place Oracle states what a version is and what changed in it, and it lags the download server by
// minutes at most.
const RELEASE = /^VirtualBox\s+(\d+\.\d+\.\d+)$/;

// Pushover rejects a message over 1024 characters and a maintenance release routinely lists twenty
// entries, so the notes get a budget and the rest are counted instead.
const NOTE_BUDGET = 700;

// Trac renders every external link with a zero-width space as its icon, which lands in textContent.
const ICON = /​/g;

const VirtualboxConfigSchema = SourceConfigSchema.extend({
  items: z.array(
    z.string().regex(
      /^(latest|\d+\.\d+)$/,
      "VirtualBox plugin items are 'latest' or a branch the changelog covers, like '7.1'",
    ),
  ).min(1, 'VirtualBox plugin requires at least one branch').default(['latest']),
});

type VirtualboxConfig = z.infer<typeof VirtualboxConfigSchema>;

type Release = { version: string; date: string; notes: string[] };

function tidy(text: string | null | undefined): string {
  return (text ?? '').replace(ICON, '').replace(/\s+/g, ' ').trim();
}

// Enough of the list to tell a security fix from a Linux kernel bump, without a message the
// destination will reject.
function summarise(notes: string[]): string[] {
  const kept: string[] = [];
  let budget = NOTE_BUDGET;

  for (const note of notes) {
    if (note.length + 2 > budget) break;

    kept.push(`• ${note}`);
    budget -= note.length + 2;
  }

  const dropped = notes.length - kept.length;

  return dropped > 0 ? [...kept, `• …and ${dropped} more`] : kept;
}

export class VirtualboxSource extends BaseSourcePlugin<VirtualboxConfig> {
  private readonly comparator = new SemverComparator();
  private readonly releases = new Map<string, Release>();

  public override getSchema() {
    return VirtualboxConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const url = this.changelogUrl(item);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to fetch the VirtualBox ${item} changelog: ${response.statusText}`);
      return '';
    }

    const releases = this.parseChangelog(await response.text());

    if (releases.length === 0) {
      console.error(`No VirtualBox releases listed at ${url}`);
      return '';
    }

    // The page is written newest first, but that is a convention rather than a guarantee, and a
    // branch page picking up an older backport at the top would report a downgrade.
    const latest = releases.reduce((highest, release) =>
      this.comparator.updated(highest.version, release.version) ? release : highest
    );

    this.releases.set(item, latest);

    return latest.version;
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    const release = this.releases.get(item);
    const when = release?.date ? ` (released ${release.date})` : '';

    const headline = before
      ? `VirtualBox ${after}${when}, was ${before}`
      : `VirtualBox: first seen version is ${after}${when}`;

    return [headline, ...summarise(release?.notes ?? []), this.changelogUrl(item)].join('\n');
  }

  private changelogUrl(item: string): string {
    // The unsuffixed page is whichever branch is current, so 'latest' follows a major release
    // across to the new branch instead of going quiet on the old one.
    return item === 'latest' ? CHANGELOG : `${CHANGELOG}-${item}`;
  }

  private parseChangelog(html: string): Release[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const page = doc?.querySelector('#wikipage');
    const releases: Release[] = [];

    // Each release is a bold heading inside a paragraph, with its fixes in the list that follows;
    // there is no wrapper element grouping the two.
    for (const heading of Array.from(page?.querySelectorAll('strong') ?? [])) {
      const label = tidy(heading.textContent);
      const version = label.match(RELEASE)?.[1];

      // Betas and release candidates are headed 'VirtualBox 7.2.0 BETA1', which the exact match
      // above drops. Nothing to install yet, so nothing to hear about.
      if (!version) continue;

      const paragraph = heading.parentElement;
      const text = tidy(paragraph?.textContent);
      const trailing = text.slice(text.indexOf(label) + label.length);
      const date = trailing.match(/^\s*\(released ([^)]+)\)/)?.[1] ?? '';

      const list = paragraph?.nextElementSibling;
      const notes = list?.tagName === 'UL'
        ? Array.from(list.querySelectorAll('li')).map((note) => tidy(note.textContent)).filter(Boolean)
        : [];

      releases.push({ version, date, notes });
    }

    return releases;
  }
}
