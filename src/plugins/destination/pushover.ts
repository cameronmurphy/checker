import BaseDestinationPlugin from './base.ts';
import { zod as z } from '../../../deps.ts';

export default class PushoverDestination extends BaseDestinationPlugin {
  private static ConfigSchema = BaseDestinationPlugin.ConfigSchema.extend({
    token: z.string(),
    user_key: z.string(),
    device: z.string().optional(),
  });

  public getSchema() {
    return PushoverDestination.ConfigSchema;
  }

  public notify(_message: string) {
    return new Promise<boolean>((resolve) => resolve(true));
  }
}
