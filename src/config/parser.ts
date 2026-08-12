import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import ConfigSchema, { buildSecondPassSchema } from './schema.ts';
import { expand } from '../utils/path.ts';
import { parse as parseYaml } from '@std/yaml';

type Definitions = Record<string, Record<string, unknown>>;

/**
 * Records on a definition the plugin its key names, so an alias of it carries that plugin into
 * whatever name another context refers to it by.
 *
 * A YAML alias is the same object as its anchor rather than a copy of it, so stamping the anchor is
 * enough to reach every use. Nothing else could be: the parser keeps neither the anchor's name nor
 * the key it was written under, which leaves an aliased definition with no way to say what it is.
 */
function stampPlugins(definitions: unknown, names: Set<string>): void {
  if (!definitions || typeof definitions !== 'object') return;

  for (const [key, definition] of Object.entries(definitions as Definitions)) {
    if (!definition || typeof definition !== 'object') continue;
    if ('plugin' in definition) continue;
    if (!names.has(key)) continue;

    definition.plugin = key;
  }
}

function stampConfig(config: unknown, sources: Set<string>, destinations: Set<string>): void {
  const { config: root } = (config ?? {}) as { config?: Record<string, unknown> };

  if (!root) return;

  for (const scope of [root, ...Object.values(root.contexts ?? {})] as Record<string, unknown>[]) {
    stampPlugins(scope.sources, sources);
    stampPlugins(scope.destinations, destinations);
  }
}

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

  stampConfig(
    config,
    new Set(sourcePlugins.map((plugin) => plugin.getName())),
    new Set(destinationPlugins.map((plugin) => plugin.getName())),
  );

  const schema = buildSecondPassSchema(sourcePlugins, destinationPlugins);
  return schema.parse(config);
}
