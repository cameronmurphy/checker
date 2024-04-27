import BasePlugin from '../base.ts';
import { zod as z } from '../../../deps.ts';
import ConfigSchema from '../../config/schema.ts';

export type ConfigType = z.infer<typeof ConfigSchema>;

export default abstract class BaseSourcePlugin extends BasePlugin {
  public static ConfigSchema = z.object({
    interval: z.number().default(3600),
    items: z.array(z.string()),
    destinations: z.array(z.string()).optional(),
  });

  protected config: ConfigType;

  protected constructor(config: ConfigType) {
    super();
    this.config = config;
  }

  // Read the state of play for a given item
  abstract read(item?: string): Promise<string>;

  // Is b new/better enough to notify a subscriber about?
  abstract updated(a: string, b: string): boolean;

  // Given there's a change, from a to b, what should we tell the subscriber?
  abstract message(a: string, b: string): string;
}

export { z as zod };
