import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import configure, { type ConfiguredContext, type PluginClass } from '../plugins/configure.ts';
import { firstPassParse, secondPassParse } from '../config/parser.ts';
import { toContexts } from '../config/schema.ts';
import { load } from '../plugins/load.ts';
import builtInSources from '../plugins/source/built-ins.ts';
import builtInDestinations from '../plugins/destination/built-ins.ts';

export default async function loadContexts(configFile: string): Promise<ConfiguredContext[]> {
  const { config } = await firstPassParse(configFile);

  const sourceClasses = [
    ...builtInSources,
    ...await load<PluginClass<BaseSourcePlugin>>(config.source_plugin_dir),
  ];
  const destinationClasses = [
    ...builtInDestinations,
    ...await load<PluginClass<BaseDestinationPlugin>>(config.destination_plugin_dir),
  ];

  const { config: finalConfig } = await secondPassParse(
    configFile,
    sourceClasses.map((SourceClass) => new SourceClass()),
    destinationClasses.map((DestinationClass) => new DestinationClass()),
  );

  return configure(toContexts(finalConfig), sourceClasses, destinationClasses);
}
