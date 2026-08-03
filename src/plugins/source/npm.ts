import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { format, maxSatisfying, type Range, tryParse, tryParseRange } from '@std/semver';
import { z } from 'zod';

const REGISTRY = 'https://registry.npmjs.org';

// The abbreviated packument: the version list without each version's metadata, which for a
// long-lived package is orders of magnitude smaller than the full document.
const PACKUMENT_ACCEPT = 'application/vnd.npm.install-v1+json';

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
    const range = tryParseRange(tag);

    return range ? await this.readRange(name, tag, range) : await this.readTag(name, tag);
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

  private async readTag(name: string, tag: string): Promise<string> {
    const response = await fetch(`${REGISTRY}/${name}/${tag}`);

    if (!response.ok) {
      if (response.status === 404) {
        console.error(`${name}: "${tag}" is neither a valid version range nor a published dist-tag`);
      } else {
        console.error(`Failed to fetch ${tag} version for ${name}: ${response.statusText}`);
      }
      return '';
    }

    const release = await response.json();
    return release.version ?? '';
  }

  private async readRange(name: string, range: string, parsed: Range): Promise<string> {
    const response = await fetch(`${REGISTRY}/${name}`, { headers: { Accept: PACKUMENT_ACCEPT } });

    if (!response.ok) {
      console.error(`Failed to fetch versions for ${name}: ${response.statusText}`);
      return '';
    }

    const packument = await response.json();
    const versions = Object.keys(packument.versions ?? {})
      .map((version) => tryParse(version))
      .filter((version) => version !== undefined);
    const latest = maxSatisfying(versions, parsed);

    // A range nothing satisfies yet is the normal state of a watch on the next major, not a failure:
    // '^5' is meant to say nothing until 5.0.0 exists. A typo'd range looks identical from here, so
    // both stay quiet; a name that isn't a package still fails above, where it's unambiguous.
    return latest ? format(latest) : '';
  }

  // Accepts npm's own 'package@tag' syntax so one source can watch several tracks at once, falling
  // back to the source-level tag. The suffix can also be a semver range such as '^4' or '4.x', which
  // pins the watch to that line. lastIndexOf leaves scoped names like '@types/node' intact.
  private parseItem(item: string): { name: string; tag: string } {
    const separator = item.lastIndexOf('@');

    if (separator > 0) {
      return { name: item.slice(0, separator), tag: item.slice(separator + 1) };
    }

    return { name: item, tag: this.getConfig().tag };
  }
}
