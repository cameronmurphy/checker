import BasePlugin from '../base.ts';
import { validateRollupValue } from '../../utils/schema.ts';
import { zod as z } from '../../../deps.ts';

export default abstract class BaseDestinationPlugin extends BasePlugin {
  public static ConfigSchema = z.object({
    rollup: z.string().refine(
      (value: string) => validateRollupValue(value),
      { message: 'Invalid rollup value' },
    ).default('none'),
  });

  public getSchema() {
    return BaseDestinationPlugin.ConfigSchema;
  }

  abstract notify(message: string): Promise<boolean>;
}
