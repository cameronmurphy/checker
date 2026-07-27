import BasePlugin from '../base.ts';
import { z } from 'zod';

export type DestinationConfigShape = Record<string, never>;

export const DestinationConfigSchema: z.ZodObject<DestinationConfigShape> = z.object({});

export type DestinationConfig = z.infer<typeof DestinationConfigSchema>;

export default abstract class BaseDestinationPlugin<TConfig extends DestinationConfig = DestinationConfig>
  extends BasePlugin<TConfig> {
  public static ConfigSchema = DestinationConfigSchema;

  public getSchema(): z.ZodObject<DestinationConfigShape> {
    return BaseDestinationPlugin.ConfigSchema;
  }

  abstract notify(message: string): Promise<boolean>;
}
