import ConfigSchema, { buildSecondPassSchema, Config } from './schema.ts';
import { parseYaml } from '../../deps.ts';
import { expand } from '../utils/path.ts';
import BaseSourcePlugin from '../plugins/source/base.ts';
import BaseDestinationPlugin from '../plugins/destination/base.ts';

export async function firstPassParse(configFilePath: string): Promise<Config> {
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
): Promise<object> {
  const decoder = new TextDecoder('utf-8');

  const path = expand(configFilePath);
  const data = await Deno.readFile(path);
  const text = decoder.decode(data);
  const config = parseYaml(text) as object;

  const schema = buildSecondPassSchema(sourcePlugins, destinationPlugins);
  return schema.parse(config);
}
