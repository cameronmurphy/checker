import BasePlugin from '../base.ts';
import { validateRollupValue } from '../../utils/schema.ts';
import { zod as z } from '../../../deps.ts';

export type BaseConfigType = z.infer<typeof BaseDestinationPlugin.BaseConfigSchema>;

export default abstract class BaseDestinationPlugin extends BasePlugin {
  public static BaseConfigSchema = z.object({
    rollup: z.string().refine(
      (value: string) => validateRollupValue(value),
      { message: 'Invalid rollup value' },
    ).default('none'),
  });

  public getSchema() {
    return BaseDestinationPlugin.BaseConfigSchema;
  }

  abstract notify(message: string): Promise<boolean>;
}
