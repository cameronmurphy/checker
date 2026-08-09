import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import CaseInsensitiveComparator from '../../comparator/case-insensitive.ts';
import { urlLabel } from '../../utils/format.ts';
import { z } from 'zod';

const PageConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.url('Page plugin items must be URLs')).min(1, 'Page plugin requires at least one URL'),
});

type PageConfig = z.infer<typeof PageConfigSchema>;

export class PageSource extends BaseSourcePlugin<PageConfig> {
  private readonly comparator = new CaseInsensitiveComparator();

  public override getSchema() {
    return PageConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const response = await fetch(item);

    if (!response.ok) {
      console.error(`Failed to fetch ${item}: ${response.statusText}`);
      return '';
    }

    // The whole body is hashed rather than stored: pages routinely exceed what a state value can
    // hold, and the size of one is not worth keeping to answer a yes-or-no question.
    const body = new TextEncoder().encode(await response.text());
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));

    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    if (!before) {
      return `${urlLabel(item)}: watching (${after.slice(0, 12)})`;
    }
    return `${urlLabel(item)}: the page changed (${before.slice(0, 12)} → ${after.slice(0, 12)})`;
  }
}
