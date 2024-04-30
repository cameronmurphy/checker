import BaseDestinationPlugin from '../plugins/destination/base.ts';
import BaseSourcePlugin from '../plugins/source/base.ts';
import configure from '../plugins/configure.ts';
import { firstPassParse, secondPassParse } from '../config/parser.ts';
import { load } from '../plugins/load.ts';
import builtInSources from '../plugins/source/built-ins.ts';
import builtInDestinations from '../plugins/destination/built-ins.ts';

export default async function app({ configFile }: { configFile: string }) {
  const { config } = await firstPassParse(configFile);

  const allSources = [...builtInSources, ...await load<BaseSourcePlugin>(config.source_plugin_dir)];
  const allDestinations = [
    ...builtInDestinations,
    ...await load<BaseDestinationPlugin>(config.destination_plugin_dir),
  ];

  const { config: finalConfig } = await secondPassParse(configFile, allSources, allDestinations);
  const { sources, destinations: _destinations } = configure(finalConfig, allSources, allDestinations);

  console.error(sources);

  // sources.map(async (source) => await source.read());

  console.log('Checker WIP');
}
