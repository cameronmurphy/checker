import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { z } from 'zod';

const NpmConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.string()).min(1, 'Npm plugin requires at least one package name'),
  tag: z.string().default('latest'),
});

type NpmConfig = z.infer<typeof NpmConfigSchema>;

export class NpmSource extends BaseSourcePlugin<NpmConfig> {
  private readonly comparator = new SemverComparator();

  public override getSchema() {
    return NpmConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const { name, tag } = this.parseItem(item);
    const response = await fetch(`https://registry.npmjs.org/${name}/${tag}`);

    if (!response.ok) {
      console.error(`Failed to fetch ${tag} version for ${name}: ${response.statusText}`);
      return '';
    }

    const release = await response.json();
    return release.version ?? '';
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    const { name, tag } = this.parseItem(item);
    const track = tag === 'latest' ? '' : ` (${tag})`;

    if (!before) {
      return `${name}${track}: first seen version is ${after}`;
    }
    return `${name}${track}: new version ${after} (was ${before})`;
  }

  // Accepts npm's own 'package@tag' syntax so one source can watch several tracks at once, falling
  // back to the source-level tag. lastIndexOf leaves scoped names like '@types/node' intact.
  private parseItem(item: string): { name: string; tag: string } {
    const separator = item.lastIndexOf('@');

    if (separator > 0) {
      return { name: item.slice(0, separator), tag: item.slice(separator + 1) };
    }

    return { name: item, tag: this.getConfig().tag };
  }
}
