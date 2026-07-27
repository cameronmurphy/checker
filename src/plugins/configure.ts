import type BaseSourcePlugin from './source/base.ts';
import type BaseDestinationPlugin from './destination/base.ts';
import type FinalConfigType from '../types/final-config.type.ts';
import type BasePlugin from './base.ts';

const applyConfig = (pluginName: string, config: object, plugins: BasePlugin[]) => {
  const plugin = plugins.find((p) => pluginName === p.getName());

  if (!plugin) {
    throw new Error(`Unknown plugin "${pluginName}" in config`);
  }

  return plugin.setConfig(config);
};

export default function configure(
  finalConfig: FinalConfigType,
  allSources: BaseSourcePlugin[],
  allDestinations: BaseDestinationPlugin[],
) {
  const sources = Object.entries(finalConfig.sources).map(([plugin, config]) =>
    applyConfig(plugin, config, allSources)
  ) as BaseSourcePlugin[];
  const destinations = Object.entries(finalConfig.destinations).map(([plugin, config]) =>
    applyConfig(plugin, config, allDestinations)
  ) as BaseDestinationPlugin[];

  return { sources, destinations };
}
