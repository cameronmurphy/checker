import BasePlugin from '../base.ts';
import ConfigSchema from '../../config/schema.ts';
import { validateRollupValue } from '../../utils/schema.ts';
import { zod as z } from '../../../deps.ts';

export type ConfigType = z.infer<typeof ConfigSchema>;

export default abstract class BaseDestinationPlugin extends BasePlugin {
  public static ConfigSchema = z.object({
    rollup: z.string().refine(
      (value: string) => validateRollupValue(value),
      { message: 'Invalid rollup value' },
    ).default('none'),
  });

  protected config: ConfigType;

  protected constructor(config: ConfigType) {
    super();
    this.config = config;
  }

  abstract notify(message: string): Promise<boolean>;
}
