import BaseSourcePlugin from './base.ts';
import { zod as z } from '../../../deps.ts';

export class GithubSource extends BaseSourcePlugin {
  private schema = BaseSourcePlugin.ConfigSchema.extend({
    items: z.array(z.string()).min(1, 'Github plugin requires at least one item'),
  });

  public getSchema() {
    return this.schema;
  }

  public read(_item?: string) {
    return new Promise<string>((resolve) => resolve(''));
  }

  public updated(_before: string, _after: string) {
    return false;
  }

  public message(_before: string, _after: string) {
    return '';
  }
}
