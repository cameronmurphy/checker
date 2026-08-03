/**
 * The base class every source plugin extends.
 *
 * A source answers three questions about one watched item: what its current value is, whether that
 * counts as a change, and how to word the notification.
 *
 * ```ts
 * import BaseSourcePlugin, { SourceConfigSchema } from 'checker/plugins/source';
 * import SemverComparator from 'checker/comparator/semver';
 * import { z } from 'zod';
 *
 * const Schema = SourceConfigSchema.extend({ items: z.array(z.string()).min(1) });
 *
 * export default class ExampleSource extends BaseSourcePlugin<z.infer<typeof Schema>> {
 *   private readonly comparator = new SemverComparator();
 *
 *   public override getSchema() {
 *     return Schema;
 *   }
 *
 *   public override async read(item: string) {
 *     const response = await fetch(`https://example.com/${item}/version`);
 *     return response.ok ? (await response.text()).trim() : '';
 *   }
 *
 *   public override updated(before: string, after: string) {
 *     return this.comparator.updated(before, after);
 *   }
 *
 *   public override message(before: string, after: string, item: string) {
 *     return before ? `${item}: ${after} (was ${before})` : `${item}: first seen ${after}`;
 *   }
 * }
 * ```
 *
 * @module
 */

import BasePlugin from '../base.ts';
import { z } from 'zod';

/** Shape of the config every source accepts, before a plugin extends it with its own fields. */
export type SourceConfigShape = {
  interval: z.ZodDefault<z.ZodNumber>;
  items: z.ZodOptional<z.ZodArray<z.ZodString>>;
  destinations: z.ZodOptional<z.ZodArray<z.ZodString>>;
};

/**
 * The config schema shared by all sources: how often to check, what to watch, and which
 * destinations to notify. Extend it to add a plugin's own options.
 */
export const SourceConfigSchema: z.ZodObject<SourceConfigShape> = z.object({
  interval: z.number().default(3600),
  items: z.array(z.string()).optional(),
  destinations: z.array(z.string()).optional(),
});

/** The parsed config a source receives, as inferred from {@linkcode SourceConfigSchema}. */
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

/**
 * Extend this to write a source. The class name determines the default config key: the `Source` suffix is
 * stripped and the rest snake-cased, so `ExampleSource` is configured as `example`.
 */
export default abstract class BaseSourcePlugin<TConfig extends SourceConfig = SourceConfig>
  extends BasePlugin<TConfig> {
  /** The config schema shared by all sources, used when a plugin doesn't narrow it. */
  public static ConfigSchema = SourceConfigSchema;

  /** The schema this plugin's config is validated against. Override to add your own fields. */
  public getSchema(): z.ZodObject<z.ZodRawShape> {
    return BaseSourcePlugin.ConfigSchema;
  }

  /**
   * The current value of one watched item, as a string to compare against what was stored last
   * time. Return an empty string to skip the item — on a failed request, say — which leaves the
   * stored value untouched so the next check retries. Never throw for an expected failure.
   */
  abstract read(item: string): Promise<string>;

  /**
   * Whether the value just read counts as an update worth notifying about. Usually delegated to a
   * comparator. `before` is an empty string the first time an item is seen.
   */
  abstract updated(before: string, after: string): boolean;

  /** The notification text sent to every destination this source is routed to. */
  abstract message(before: string, after: string, item: string): string;
}
