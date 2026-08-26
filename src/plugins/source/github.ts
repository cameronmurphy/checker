import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { greaterThan, type SemVer, tryParse } from '@std/semver';
import { z } from 'zod';

const TRACKS = ['highest', 'latest'] as const;
const ITEM = /^[^\s/@]+\/[^\s/@]+(@(highest|latest))?$/;

const GithubConfigSchema = SourceConfigSchema.extend({
  items: z.array(
    z.string().refine(
      (item) => ITEM.test(item),
      "Github plugin items are written 'owner/repo', optionally suffixed '@highest' or '@latest'",
    ),
  ).min(1, 'Github plugin requires at least one item'),
  track: z.enum(TRACKS).default('latest'),
});

type Track = (typeof TRACKS)[number];

type GithubConfig = z.infer<typeof GithubConfigSchema>;

type Release = { tag_name?: string; draft?: boolean; prerelease?: boolean };

export class GithubSource extends BaseSourcePlugin<GithubConfig> {
  private readonly comparator = new SemverComparator();

  public override getSchema() {
    return GithubConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const { repo, track } = this.parseItem(item);

    return track === 'latest' ? await this.readDesignated(repo) : await this.readHighest(repo);
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    const { repo, track } = this.parseItem(item);
    const label = track === 'latest' ? '' : ` (${track})`;

    if (!before) {
      return `${repo}${label}: first seen release is ${after}`;
    }
    return `${repo}${label}: new release ${after} (was ${before})`;
  }

  private async readHighest(repo: string): Promise<string> {
    // One page only: these requests are unauthenticated and share a 60/hr budget.
    const response = await this.get(repo, `https://api.github.com/repos/${repo}/releases?per_page=100`);

    if (!response) return '';

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

  private async readDesignated(repo: string): Promise<string> {
    const response = await this.get(repo, `https://api.github.com/repos/${repo}/releases/latest`);

    if (!response) return '';

    const release: Release = await response.json();
    return release.tag_name ?? '';
  }

  private async get(repo: string, url: string): Promise<Response | null> {
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } });

    if (!response.ok) {
      console.error(`Failed to fetch latest release for ${repo}: ${response.statusText}`);
      return null;
    }

    return response;
  }

  // 'latest' follows the release GitHub designates as latest, which is what a project means by
  // released: pnpm shipped v12.0.0 as a full release while leaving 11.24.0 designated, and only the
  // designation says the major is meant to be picked up yet. 'highest' takes the greatest version
  // published instead, for a project that backports — a patch landing on an older branch takes the
  // designation and hides every newer major behind it, which is how pestphp/pest made its whole 5.x
  // line invisible. Neither is derivable from the other, since the API reports both cases
  // identically, so an item's suffix decides it and the source-level track answers for the rest.
  private parseItem(item: string): { repo: string; track: Track } {
    const separator = item.lastIndexOf('@');

    if (separator > 0) {
      return { repo: item.slice(0, separator), track: item.slice(separator + 1) as Track };
    }

    return { repo: item, track: this.getConfig().track };
  }
}
