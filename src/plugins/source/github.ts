import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { z } from 'zod';

const GithubConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.string()).min(1, 'Github plugin requires at least one item'),
});

type GithubConfig = z.infer<typeof GithubConfigSchema>;

export class GithubSource extends BaseSourcePlugin<GithubConfig> {
  private readonly comparator = new SemverComparator();

  public override getSchema() {
    return GithubConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const response = await fetch(`https://api.github.com/repos/${item}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch latest release for ${item}: ${response.statusText}`);
      return '';
    }

    const release = await response.json();
    return release.tag_name ?? '';
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
