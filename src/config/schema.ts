import BaseDestinationPlugin from '../plugins/destination/base.ts';
import BaseSourcePlugin from '../plugins/source/base.ts';
import { DEFAULT_DESTINATION_PLUGIN_DIR, DEFAULT_SOURCE_PLUGIN_DIR } from '../constants.ts';
import { z } from 'zod';

const ConfigSchema = z.object({
  config: z.object({
    source_plugin_dir: z.string().default(DEFAULT_SOURCE_PLUGIN_DIR),
    destination_plugin_dir: z.string().default(DEFAULT_DESTINATION_PLUGIN_DIR),
    sources: z.record(z.string(), BaseSourcePlugin.ConfigSchema),
    destinations: z.record(z.string(), BaseDestinationPlugin.ConfigSchema),
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

  return ConfigSchema.extend({
    config: z.object({
      sources: z.object(sourceSchemas),
      destinations: z.object(destinationSchemas),
    }),
  });
}

export type Config = z.infer<typeof ConfigSchema>;

export default ConfigSchema;
