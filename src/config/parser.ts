import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import ConfigSchema, { buildSecondPassSchema } from './schema.ts';
import { expand } from '../utils/path.ts';
import { parse as parseYaml } from '@std/yaml';

export async function firstPassParse(configFilePath: string) {
  const decoder = new TextDecoder('utf-8');

  const path = expand(configFilePath);
  const data = await Deno.readFile(path);
  const text = decoder.decode(data);
  const config = parseYaml(text) as object;

  return ConfigSchema.parse(config);
}

export async function secondPassParse(
  configFilePath: string,
  sourcePlugins: BaseSourcePlugin[],
  destinationPlugins: BaseDestinationPlugin[],
) {
  const decoder = new TextDecoder('utf-8');

  const path = expand(configFilePath);
  const data = await Deno.readFile(path);
  const text = decoder.decode(data);
  const config = parseYaml(text) as object;

  const schema = buildSecondPassSchema(sourcePlugins, destinationPlugins);
  return schema.parse(config);
}
