import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import type BaseComparator from '../../comparator/base.ts';
import CaseInsensitiveComparator from '../../comparator/case-insensitive.ts';
import SemverComparator from '../../comparator/semver.ts';
import { urlLabel } from '../../utils/format.ts';
import { z } from 'zod';

// The whole body becomes the stored value, so this is for endpoints that answer with one short
// line — a version, a build number, a channel marker. Anything longer is a page, and 'page' is the
// plugin for those.
const MAX_LENGTH = 256;

// Comparators hold no per-item state, so one instance each serves every source using this plugin.
const COMPARATORS: Record<string, BaseComparator> = {
  case_insensitive: new CaseInsensitiveComparator(),
  semver: new SemverComparator(),
};

const TextConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.url('Text plugin items must be URLs')).min(1, 'Text plugin requires at least one URL'),
  comparator: z.enum(['case_insensitive', 'semver']).default('case_insensitive'),
});

type TextConfig = z.infer<typeof TextConfigSchema>;

export class TextSource extends BaseSourcePlugin<TextConfig> {
  public override getSchema() {
    return TextConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const response = await fetch(item);

    if (!response.ok) {
      console.error(`Failed to fetch ${item}: ${response.statusText}`);
      return '';
    }

    const body = (await response.text()).trim();

    if (body.length > MAX_LENGTH || body.includes('\n')) {
      console.error(`${item} answered with more than one short line, which the page plugin handles instead`);
      return '';
    }

    return body;
  }

  public override updated(before: string, after: string): boolean {
    return COMPARATORS[this.getConfig().comparator].updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    if (!before) {
      return `${urlLabel(item)}: first seen value is ${after}`;
    }

    return `${urlLabel(item)}: ${after} (was ${before})`;
  }
}
