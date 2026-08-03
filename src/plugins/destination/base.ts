/**
 * The base class every destination plugin extends.
 *
 * A destination takes the message a source produced and delivers it somewhere.
 *
 * ```ts
 * import BaseDestinationPlugin, { DestinationConfigSchema } from 'checker/plugins/destination';
 * import { z } from 'zod';
 *
 * const Schema = DestinationConfigSchema.extend({ webhook: z.string() });
 *
 * export default class ExampleDestination extends BaseDestinationPlugin<z.infer<typeof Schema>> {
 *   public override getSchema() {
 *     return Schema;
 *   }
 *
 *   public override async notify(message: string) {
 *     const response = await fetch(this.getConfig().webhook, { method: 'POST', body: message });
 *     return response.ok;
 *   }
 * }
 * ```
 *
 * @module
 */

import BasePlugin from '../base.ts';
import { z } from 'zod';

/**
 * Shape of the config every destination accepts. It is empty — a destination's options are entirely
 * its own — and exists so plugins have something to extend.
 */
export type DestinationConfigShape = Record<never, never>;

/** The empty base schema. Extend it with the fields your destination needs. */
export const DestinationConfigSchema: z.ZodObject<DestinationConfigShape> = z.object({});

/** The parsed config a destination receives, as inferred from {@linkcode DestinationConfigSchema}. */
export type DestinationConfig = z.infer<typeof DestinationConfigSchema>;

/**
 * Extend this to write a destination. The class name determines the default config key: the `Destination`
 * suffix is stripped and the rest snake-cased, so `ExampleDestination` is configured as `example`.
 */
export default abstract class BaseDestinationPlugin<TConfig extends object = object> extends BasePlugin<TConfig> {
  /** The empty base schema, used when a plugin doesn't narrow it. */
  public static ConfigSchema = DestinationConfigSchema;

  /** The schema this plugin's config is validated against. Override to add your own fields. */
  public getSchema(): z.ZodObject<DestinationConfigShape> {
    return BaseDestinationPlugin.ConfigSchema;
  }

  /**
   * Deliver one message. Return whether it was accepted: if no destination accepts an update, the
   * source's stored value is left alone so the next check retries rather than losing it.
   */
  abstract notify(message: string): Promise<boolean>;
}
