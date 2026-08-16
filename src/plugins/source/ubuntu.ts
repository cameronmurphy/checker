import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import DebianComparator, { compare } from '../../comparator/debian.ts';
import { z } from 'zod';

const LAUNCHPAD = 'https://api.launchpad.net/1.0';
const PPA = /^ppa:([^\s/]+)\/([^\s/]+)$/;
const ARCHIVE = /^[a-z0-9][a-z0-9.+-]*$/;

// Neither pocket is enabled on a stock machine, and both carry versions apt won't install until it
// is, so an update published to one is not an update you could act on.
const IGNORED_POCKETS = new Set(['Proposed', 'Backports']);

const UbuntuConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.string()).min(1, 'Ubuntu plugin requires at least one package name'),
  archive: z.string()
    .refine(
      (archive) => PPA.test(archive) || ARCHIVE.test(archive),
      "Ubuntu plugin archive must be 'ubuntu' or a PPA written the way add-apt-repository takes it, 'ppa:owner/name'",
    )
    .default('ubuntu'),
  series: z.string().optional(),
});

type UbuntuConfig = z.infer<typeof UbuntuConfigSchema>;

type PublishedSource = { pocket?: string; source_package_version?: string };

export class UbuntuSource extends BaseSourcePlugin<UbuntuConfig> {
  private readonly comparator = new DebianComparator();

  public override getSchema() {
    return UbuntuConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const { name, series } = this.parseItem(item);

    if (!series) {
      console.error(`${name}: no Ubuntu series to check. Set 'series' on the source, or write '${name}/noble'`);
      return '';
    }

    const url = new URL(this.archiveUrl());
    url.search = new URLSearchParams({
      'ws.op': 'getPublishedSources',
      source_name: name,
      exact_match: 'true',
      status: 'Published',
      distro_series: `${LAUNCHPAD}/ubuntu/${series}`,
    }).toString();

    const response = await fetch(url, { headers: { accept: 'application/json' } });

    if (!response.ok) {
      await response.body?.cancel();
      console.error(`Failed to look up ${this.itemLabel(item)}: ${response.statusText}`);
      return '';
    }

    const entries: PublishedSource[] = (await response.json()).entries ?? [];
    const versions = entries
      .filter((entry) => !IGNORED_POCKETS.has(entry.pocket ?? ''))
      .map((entry) => entry.source_package_version ?? '')
      .filter((version) => version !== '');

    // An archive and a series that both exist still answer with nothing for a package that isn't in
    // them, and the usual reason is a binary package name where a source one belongs.
    if (versions.length === 0) {
      const naming = "Items are source package names, so 'php8.5' rather than 'php8.5-fpm'";

      console.error(`${this.itemLabel(item)}: nothing published. ${naming}`);
      return '';
    }

    // Launchpad publishes one pocket at a time, so a security update and the release it patches both
    // come back. apt installs the highest of them, so that's the one worth watching.
    return versions.reduce((highest, version) => compare(version, highest) > 0 ? version : highest);
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    if (!before) {
      return `${this.itemLabel(item)}: first seen version is ${after}`;
    }
    return `${this.itemLabel(item)}: new version ${after} (was ${before})`;
  }

  private archiveUrl(): string {
    const { archive } = this.getConfig();
    const ppa = archive.match(PPA);

    if (ppa) {
      return `${LAUNCHPAD}/~${ppa[1]}/+archive/ubuntu/${ppa[2]}`;
    }

    // 'ubuntu' is what a sources.list calls the distribution's own archive; Launchpad calls it primary.
    return `${LAUNCHPAD}/ubuntu/+archive/${archive === 'ubuntu' ? 'primary' : archive}`;
  }

  private itemLabel(item: string): string {
    const { name, series } = this.parseItem(item);
    const { archive } = this.getConfig();
    const where = [series, archive === 'ubuntu' ? '' : archive].filter(Boolean).join(', ');

    return where ? `${name} (${where})` : name;
  }

  // apt's own 'package/release' syntax, so one source can watch several series at once, falling back
  // to the source-level series.
  private parseItem(item: string): { name: string; series: string | undefined } {
    const separator = item.indexOf('/');

    if (separator > 0) {
      return { name: item.slice(0, separator), series: item.slice(separator + 1) };
    }

    return { name: item, series: this.getConfig().series };
  }
}
