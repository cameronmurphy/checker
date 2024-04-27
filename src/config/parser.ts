import ConfigSchema, { Config } from './schema.ts';
import { parseYaml } from '../../deps.ts';
import { expand } from '../utils/path.ts';

export async function firstPassParse(configFilePath: string): Promise<Config> {
  const decoder = new TextDecoder('utf-8');

  const path = expand(configFilePath);
  const data = await Deno.readFile(path);
  const text = decoder.decode(data);
  const config = parseYaml(text) as object;

  return ConfigSchema.parse(config);
}
