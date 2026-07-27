import BaseDestinationPlugin, { DestinationConfigSchema } from './base.ts';
import { z } from 'zod';

const PushoverConfigSchema = DestinationConfigSchema.extend({
  token: z.string(),
  user_key: z.string(),
  device: z.string().optional(),
});

type PushoverConfig = z.infer<typeof PushoverConfigSchema>;

export default class PushoverDestination extends BaseDestinationPlugin<PushoverConfig> {
  public override getSchema() {
    return PushoverConfigSchema;
  }

  public override async notify(message: string): Promise<boolean> {
    const config = this.getConfig();

    const response = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: config.token,
        user: config.user_key,
        message,
        ...(config.device ? { device: config.device } : {}),
      }),
    });

    if (!response.ok) {
      console.error(`Pushover notification failed: ${response.statusText}`);
      return false;
    }

    return true;
  }
}
