import { validateRollupValue } from '../../utils/schema.ts';
import { zod as z } from '../../../deps.ts';

abstract class BaseDestinationPlugin {
  public static ConfigSchema = z.object({
    rollup: z.string().refine(
      (value: string) => validateRollupValue(value),
      { message: 'Invalid rollup value' },
    ).default('none'),
  });

  abstract notify(message: string): Promise<boolean>;
}

export default BaseDestinationPlugin;
