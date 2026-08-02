import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { greaterThan, type SemVer, tryParse } from '@std/semver';
import { z } from 'zod';

const DIST_INDEX = 'https://nodejs.org/dist/index.json';

const NodejsConfigSchema = SourceConfigSchema.extend({
  items: z.array(
    z.string().regex(
      /^(\d+|lts|latest)$/,
      "Nodejs plugin items must be a major version such as '24', or 'lts', or 'latest'",
    ),
  ).min(1, 'Nodejs plugin requires at least one item'),
});

type NodejsConfig = z.infer<typeof NodejsConfigSchema>;

type Release = { version: string; date?: string; lts?: string | false; security?: boolean };

export class NodejsSource extends BaseSourcePlugin<NodejsConfig> {
  private readonly comparator = new SemverComparator();
  private readonly security = new Map<string, boolean>();

  public override getSchema() {
    return NodejsConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const response = await fetch(DIST_INDEX);

    if (!response.ok) {
      console.error(`Failed to fetch the Node.js release index: ${response.statusText}`);
      return '';
    }

    const releases: Release[] = await response.json();

    let latest: Release | null = null;
    let latestVersion: SemVer | null = null;

    for (const release of releases) {
      if (!this.tracks(item, release)) continue;

      const version = tryParse(release.version);

      if (!version) continue;
      if (latestVersion && !greaterThan(version, latestVersion)) continue;

      latest = release;
      latestVersion = version;
    }

    if (!latest) {
      console.error(`No Node.js release matching "${item}"`);
      return '';
    }

    this.security.set(item, latest.security === true);

    return latest.version;
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    const security = this.security.get(item) ? ' (security release)' : '';

    if (!before) {
      return `Node.js ${item}: first seen version is ${after}${security}`;
    }

    return `Node.js ${item}: new version ${after} (was ${before})${security}`;
  }

  private tracks(item: string, release: Release): boolean {
    if (item === 'latest') return true;
    if (item === 'lts') return Boolean(release.lts);

    return release.version.startsWith(`v${item}.`);
  }
}
