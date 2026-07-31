import type BaseSourcePlugin from './source/base.ts';
import type BaseDestinationPlugin from './destination/base.ts';
import type { ContextConfigType } from '../types/final-config.type.ts';
import type BasePlugin from './base.ts';

export type PluginClass<T extends BasePlugin> = new () => T;

export type ConfiguredContext = {
  name: string;
  sources: BaseSourcePlugin[];
  destinations: BaseDestinationPlugin[];
};

function instantiate<T extends BasePlugin>(
  pluginConfigs: Record<string, object>,
  classes: PluginClass<T>[],
): T[] {
  const byName = new Map(classes.map((candidate) => [new candidate().getName(), candidate]));

  return Object.entries(pluginConfigs).map(([pluginName, config]) => {
    const PluginClass = byName.get(pluginName);

    if (!PluginClass) {
      throw new Error(`Unknown plugin "${pluginName}" in config`);
    }

    return new PluginClass().setConfig(config);
  });
}

export default function configure(
  contexts: Record<string, ContextConfigType>,
  allSources: PluginClass<BaseSourcePlugin>[],
  allDestinations: PluginClass<BaseDestinationPlugin>[],
): ConfiguredContext[] {
  return Object.entries(contexts).map(([name, context]) => ({
    name,
    sources: instantiate(context.sources, allSources),
    destinations: instantiate(context.destinations, allDestinations),
  }));
}
