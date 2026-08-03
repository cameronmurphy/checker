import type BaseSourcePlugin from './source/base.ts';
import type BaseDestinationPlugin from './destination/base.ts';
import type { ContextConfigType, ErrorsConfigType, PluginsConfigType } from '../types/final-config.type.ts';
import type BasePlugin from './base.ts';

export type PluginClass<T extends BasePlugin> = new () => T;

export type ConfiguredContext = {
  name: string;
  sources: BaseSourcePlugin[];
  destinations: BaseDestinationPlugin[];
  errors?: ErrorsConfigType;
};

function instantiate<T extends BasePlugin>(
  pluginConfigs: PluginsConfigType,
  classes: PluginClass<T>[],
): T[] {
  const byName = new Map(classes.map((candidate) => [new candidate().getName(), candidate]));

  return Object.entries(pluginConfigs).map(([alias, { plugin, config }]) => {
    const PluginClass = byName.get(plugin);

    if (!PluginClass) {
      throw new Error(`Unknown plugin "${plugin}" in config`);
    }

    return new PluginClass().setConfig(config).setAlias(alias);
  });
}

export default function configure(
  contexts: Record<string, ContextConfigType>,
  allSources: PluginClass<BaseSourcePlugin>[],
  allDestinations: PluginClass<BaseDestinationPlugin>[],
): ConfiguredContext[] {
  return Object.entries(contexts).map(([name, context]) => {
    const sources = instantiate(context.sources, allSources);
    const destinations = instantiate(context.destinations, allDestinations);
    const configured = new Set(destinations.map((destination) => destination.getAlias()));

    const referenced = [
      ...sources.flatMap((source) => source.getConfig().destinations ?? []),
      ...context.errors?.destinations ?? [],
    ];

    for (const reference of referenced) {
      if (!configured.has(reference)) {
        throw new Error(`Unknown destination "${reference}" in context "${name}"`);
      }
    }

    return { name, sources, destinations, errors: context.errors };
  });
}
