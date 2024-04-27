import BaseSourcePlugin from './base.ts';
import { zod as z } from '../../../deps.ts';

export class GithubSource extends BaseSourcePlugin {
  public static ConfigSchema = BaseSourcePlugin.ConfigSchema.extend({
    items: z.array(z.string()).nonempty('Github plugin requires at least one item'),
  });
}
