import BaseSourcePlugin from './source/base.ts';
import BaseDestinationPlugin from './destination/base.ts';
import FinalConfigType from '../types/final-config.type.ts';
import BasePlugin from './base.ts';

const applyConfig = (pluginName: string, config: object, plugins: BasePlugin[]) => {
  const plugin = plugins.find((plugin) => pluginName === plugin.getName());

  if (!plugin) {
    throw new Error(`Unknown plugin ${plugin} in config`);
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
