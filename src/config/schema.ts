import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import { DEFAULT_CONTEXT, DEFAULT_DESTINATION_PLUGIN_DIR, DEFAULT_SOURCE_PLUGIN_DIR } from '../constants.ts';
import type { ContextConfigType, PluginsConfigType } from '../types/final-config.type.ts';
import type FinalConfigType from '../types/final-config.type.ts';
import { z } from 'zod';

const ErrorsSchema = z.strictObject({
  destinations: z.array(z.string()).optional(),
});

// A plugin is keyed by the name the rest of the config refers to it by. That's the plugin's own name
// unless `plugin` says otherwise, which is how one plugin backs several sources or destinations.
const AliasedPluginSchema = z.looseObject({ plugin: z.string().optional() });

const ContextSchema = z.strictObject({
  sources: z.record(z.string(), AliasedPluginSchema).default({}),
  destinations: z.record(z.string(), AliasedPluginSchema).default({}),
  errors: ErrorsSchema.optional(),
});

const ConfigSchema = z.strictObject({
  config: z.strictObject({
    source_plugin_dir: z.string().default(DEFAULT_SOURCE_PLUGIN_DIR),
    destination_plugin_dir: z.string().default(DEFAULT_DESTINATION_PLUGIN_DIR),
    sources: z.record(z.string(), AliasedPluginSchema).optional(),
    destinations: z.record(z.string(), AliasedPluginSchema).optional(),
    errors: ErrorsSchema.optional(),
    contexts: z.record(z.string(), ContextSchema).optional(),
  }),
});

function buildPluginsSchema(kind: string, plugins: (BaseSourcePlugin | BaseDestinationPlugin)[]) {
  const schemas = new Map(plugins.map((plugin) => [plugin.getName(), plugin.getSchema()]));

  return z.record(z.string(), AliasedPluginSchema).transform((configs, ctx): PluginsConfigType => {
    const parsed: PluginsConfigType = {};

    for (const [alias, { plugin, ...rest }] of Object.entries(configs)) {
      const name = plugin ?? alias;
      const schema = schemas.get(name);

      if (!schema) {
        ctx.addIssue({ code: 'custom', path: [alias], message: `Unknown ${kind} plugin "${name}"` });
        continue;
      }

      const result = schema.safeParse(rest);

      if (!result.success) {
        result.error.issues.forEach((issue) => ctx.addIssue({ ...issue, path: [alias, ...issue.path] }));
        continue;
      }

      parsed[alias] = { plugin: name, config: result.data };
    }

    return parsed;
  });
}

export function buildSecondPassSchema(
  sources: BaseSourcePlugin[],
  destinations: BaseDestinationPlugin[],
) {
  const sourcesSchema = buildPluginsSchema('source', sources);
  const destinationsSchema = buildPluginsSchema('destination', destinations);

  const knownContextSchema = z.strictObject({
    sources: sourcesSchema.default({}),
    destinations: destinationsSchema.default({}),
    errors: ErrorsSchema.optional(),
  });

  return ConfigSchema.extend({
    config: z.strictObject({
      source_plugin_dir: z.string().default(DEFAULT_SOURCE_PLUGIN_DIR),
      destination_plugin_dir: z.string().default(DEFAULT_DESTINATION_PLUGIN_DIR),
      sources: sourcesSchema.optional(),
      destinations: destinationsSchema.optional(),
      errors: ErrorsSchema.optional(),
      contexts: z.record(z.string(), knownContextSchema).optional(),
    }),
  });
}

export function toContexts(config: FinalConfigType): Record<string, ContextConfigType> {
  const topLevel = config.sources ?? config.destinations ?? config.errors;

  if (config.contexts && topLevel) {
    throw new Error(
      'Config sets both `contexts` and top-level `sources`/`destinations`. Move the top-level ones ' +
        `into a context (\`contexts.${DEFAULT_CONTEXT}\` keeps their existing state).`,
    );
  }

  if (config.contexts) {
    return config.contexts;
  }

  return {
    [DEFAULT_CONTEXT]: {
      sources: config.sources ?? {},
      destinations: config.destinations ?? {},
      ...(config.errors ? { errors: config.errors } : {}),
    },
  };
}

export type Config = z.infer<typeof ConfigSchema>;

export default ConfigSchema;
