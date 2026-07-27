import BasePlugin from '../base.ts';
import { z } from 'zod';

export type SourceConfigShape = {
  interval: z.ZodDefault<z.ZodNumber>;
  items: z.ZodArray<z.ZodString>;
  destinations: z.ZodOptional<z.ZodArray<z.ZodString>>;
};

export const SourceConfigSchema: z.ZodObject<SourceConfigShape> = z.object({
  interval: z.number().default(3600),
  items: z.array(z.string()),
  destinations: z.array(z.string()).optional(),
});

export type SourceConfig = z.infer<typeof SourceConfigSchema>;

export default abstract class BaseSourcePlugin<TConfig extends SourceConfig = SourceConfig>
  extends BasePlugin<TConfig> {
  public static ConfigSchema = SourceConfigSchema;

  public getSchema(): z.ZodObject<SourceConfigShape> {
    return BaseSourcePlugin.ConfigSchema;
  }

  abstract read(item: string): Promise<string>;

  abstract updated(before: string, after: string): boolean;

  abstract message(before: string, after: string, item: string): string;
}
