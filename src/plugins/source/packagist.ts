import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { format, maxSatisfying, type Range, tryParse, tryParseRange } from '@std/semver';
import { z } from 'zod';

const REGISTRY = 'https://repo.packagist.org';

const ITEM = /^[^\s/@]+\/[^\s/@]+(@.+)?$/;

const PackagistConfigSchema = SourceConfigSchema.extend({
  items: z.array(
    z.string().refine(
      (item) => ITEM.test(item),
      "Packagist plugin items are written 'vendor/package', optionally suffixed '@<range>'",
    ),
  ).min(1, 'Packagist plugin requires at least one package name'),
  constraint: z.string().default('*'),
});

type PackagistConfig = z.infer<typeof PackagistConfigSchema>;

export class PackagistSource extends BaseSourcePlugin<PackagistConfig> {
  private readonly comparator = new SemverComparator();

  public override getSchema() {
    return PackagistConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const { name, constraint } = this.parseItem(item);
    const range = tryParseRange(constraint);

    if (!range) {
      // Composer has nothing like a dist-tag, so a suffix that isn't a range is a typo and
      // nothing else. Saying so here beats a watch that silently never matches.
      console.error(`${name}: "${constraint}" is not a valid version range`);
      return '';
    }

    return await this.readRange(name, range);
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    const { name, constraint } = this.parseItem(item);
    const track = constraint === '*' ? '' : ` (${constraint})`;

    if (!before) {
      return `${name}${track}: first seen version is ${after}`;
    }
    return `${name}${track}: new version ${after} (was ${before})`;
  }

  // The p2 metadata file, which is what Composer itself reads. Branches live in a separate '~dev'
  // file that isn't fetched, so 'dev-main' can never be selected as a release.
  private async readRange(name: string, range: Range): Promise<string> {
    const response = await fetch(`${REGISTRY}/p2/${name}.json`, { headers: { accept: 'application/json' } });

    if (!response.ok) {
      if (response.status === 404) {
        console.error(`${name} is not a package on Packagist`);
      } else {
        console.error(`Failed to fetch versions for ${name}: ${response.statusText}`);
      }
      return '';
    }

    const metadata = await response.json();
    const releases: { version?: string }[] = metadata.packages?.[name] ?? [];
    const versions = releases
      .map((release) => tryParse(release.version ?? ''))
      .filter((version) => version !== undefined);
    const latest = maxSatisfying(versions, range);

    // A range nothing satisfies yet is the normal state of a watch on the next major, not a
    // failure, so it stays quiet the way the npm source does.
    return latest ? format(latest) : '';
  }

  // The suffix is a Composer-style package name's one unambiguous separator: '@' can't appear in
  // 'vendor/package', so everything after the last one is the range, falling back to the
  // source-level constraint. '*' means the newest stable release, since a range only matches
  // prereleases when it asks for them.
  private parseItem(item: string): { name: string; constraint: string } {
    const separator = item.lastIndexOf('@');

    if (separator > 0) {
      return { name: item.slice(0, separator), constraint: item.slice(separator + 1) };
    }

    return { name: item, constraint: this.getConfig().constraint };
  }
}
