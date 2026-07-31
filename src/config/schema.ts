import BaseDestinationPlugin from '../plugins/destination/base.ts';
import BaseSourcePlugin from '../plugins/source/base.ts';
import { DEFAULT_CONTEXT, DEFAULT_DESTINATION_PLUGIN_DIR, DEFAULT_SOURCE_PLUGIN_DIR } from '../constants.ts';
import type { ContextConfigType } from '../types/final-config.type.ts';
import type FinalConfigType from '../types/final-config.type.ts';
import { z } from 'zod';

const ContextSchema = z.object({
  sources: z.record(z.string(), BaseSourcePlugin.ConfigSchema).default({}),
  destinations: z.record(z.string(), BaseDestinationPlugin.ConfigSchema).default({}),
});

const ConfigSchema = z.object({
  config: z.object({
    source_plugin_dir: z.string().default(DEFAULT_SOURCE_PLUGIN_DIR),
    destination_plugin_dir: z.string().default(DEFAULT_DESTINATION_PLUGIN_DIR),
    sources: z.record(z.string(), BaseSourcePlugin.ConfigSchema).optional(),
    destinations: z.record(z.string(), BaseDestinationPlugin.ConfigSchema).optional(),
    contexts: z.record(z.string(), ContextSchema).optional(),
  }),
});

export function buildSecondPassSchema(
  sources: BaseSourcePlugin[],
  destinations: BaseDestinationPlugin[],
) {
  const sourceSchemas = sources.reduce((acc, source) => ({
    ...acc,
    [source.getName()]: source.getSchema().optional(),
  }), {});

  const destinationSchemas = destinations.reduce((acc, destination) => ({
    ...acc,
    [destination.getName()]: destination.getSchema().optional(),
  }), {});

  const knownContextSchema = z.object({
    sources: z.object(sourceSchemas).default({}),
    destinations: z.object(destinationSchemas).default({}),
  });

  return ConfigSchema.extend({
    config: z.object({
      sources: z.object(sourceSchemas).optional(),
      destinations: z.object(destinationSchemas).optional(),
      contexts: z.record(z.string(), knownContextSchema).optional(),
    }),
  });
}

export function toContexts(config: FinalConfigType): Record<string, ContextConfigType> {
  const topLevel = config.sources ?? config.destinations;

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
    },
  };
}

export type Config = z.infer<typeof ConfigSchema>;

export default ConfigSchema;
