import defaults from './defaults.ts';
import { deepMerge, parseYaml } from '../../deps.ts';
import { expand } from '../utils/path.ts';
import ConfigSchema, { Config } from './schema.ts';

export async function firstPassParse(configFilePath: string): Promise<Config> {
  const decoder = new TextDecoder('utf-8');

  const path = expand(configFilePath);
  const data = await Deno.readFile(path);
  const text = decoder.decode(data);
  const config = parseYaml(text) as object;
  const configWithDefaults = deepMerge(defaults, config);

  return ConfigSchema.parse(configWithDefaults);
}
