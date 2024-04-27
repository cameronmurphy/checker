import { zod as z } from '../../../deps.ts';

abstract class BaseSourcePlugin {
  public static ConfigSchema = z.object({
    interval: z.number().default(3600),
    items: z.array(z.string()),
    destinations: z.array(z.string()).optional(),
  });

  protected config: object;

  protected constructor(config: object) {
    this.config = config;
  }

  // Read the state of play for a given item
  abstract read(item?: string): Promise<string>;

  // Is b new/better enough to notify a subscriber about?
  abstract updated(a: string, b: string): boolean;

  // Given there's a change, from a to b, what should we tell the subscriber?
  abstract message(a: string, b: string): string;
}

export default BaseSourcePlugin;
