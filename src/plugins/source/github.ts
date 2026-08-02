import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { greaterThan, type SemVer, tryParse } from '@std/semver';
import { z } from 'zod';

const GithubConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.string()).min(1, 'Github plugin requires at least one item'),
});

type GithubConfig = z.infer<typeof GithubConfigSchema>;

type Release = { tag_name?: string; draft?: boolean; prerelease?: boolean };

export class GithubSource extends BaseSourcePlugin<GithubConfig> {
  private readonly comparator = new SemverComparator();

  public override getSchema() {
    return GithubConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    // /releases/latest is whatever was published most recently, not the highest version, so a patch
    // backported to an older branch hides every newer major behind it. One page only: these requests
    // are unauthenticated and share a 60/hr budget.
    const response = await fetch(`https://api.github.com/repos/${item}/releases?per_page=100`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch latest release for ${item}: ${response.statusText}`);
      return '';
    }

    const releases: Release[] = await response.json();
    const tags = releases
      .filter((release) => !release.draft && !release.prerelease)
      .map((release) => release.tag_name)
      .filter((tag): tag is string => Boolean(tag));

    let latest = '';
    let latestVersion: SemVer | null = null;

    for (const tag of tags) {
      const version = tryParse(tag);

      // Not every tag is semver ('nightly', 'release-1.2.3'). Those can't be ranked, so they're
      // skipped rather than throwing.
      if (!version) continue;
      if (latestVersion && !greaterThan(version, latestVersion)) continue;

      // The raw tag, never a normalised one: stored state holds tags as GitHub writes them, and the
      // comparator has to keep seeing the same shape.
      latest = tag;
      latestVersion = version;
    }

    // Nothing parseable — fall back to the most recently published release so a repo that doesn't
    // tag semver degrades to the old behaviour instead of going silent.
    return latest || tags[0] || '';
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    if (!before) {
      return `${item}: first seen release is ${after}`;
    }
    return `${item}: new release ${after} (was ${before})`;
  }
}
