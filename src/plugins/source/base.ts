import BasePlugin from '../base.ts';
import { zod as z } from '../../../deps.ts';

export default abstract class BaseSourcePlugin extends BasePlugin {
  public static BaseConfigSchema = z.object({
    interval: z.number().default(3600),
    items: z.array(z.string()),
    destinations: z.array(z.string()).optional(),
  });

  public getSchema() {
    return BaseSourcePlugin.BaseConfigSchema;
  }

  // Read the state of play for a given item
  abstract read(item?: string): Promise<string>;

  // Is b new/better enough to notify a subscriber about?
  abstract updated(a: string, b: string): boolean;

  // Given there's a change, from a to b, what should we tell the subscriber?
  abstract message(a: string, b: string): string;
}

export { z as zod };
