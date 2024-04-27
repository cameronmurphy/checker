import BaseDestinationPlugin from '../plugins/destination/base.ts';
import BaseSourcePlugin from '../plugins/source/base.ts';
import { DEFAULT_DESTINATION_PLUGIN_DIR, DEFAULT_SOURCE_PLUGIN_DIR } from '../constants.ts';
import { zod as z } from '../../deps.ts';

const ConfigSchema = z.object({
  config: z.object({
    source_plugin_dir: z.string().default(DEFAULT_SOURCE_PLUGIN_DIR),
    destination_plugin_dir: z.string().default(DEFAULT_DESTINATION_PLUGIN_DIR),
    sources: z.record(BaseSourcePlugin.ConfigSchema),
    destinations: z.record(BaseDestinationPlugin.ConfigSchema),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export default ConfigSchema;
