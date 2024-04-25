import { zod as z } from '../../deps.ts';

const ConfigSchema = z.object({
  config: z.object({
    source_plugin_dir: z.string().optional(),
    destination_plugin_dir: z.string().optional(),
    sources: z.object({}),
    destinations: z.object({}),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export default ConfigSchema;
