import { firstPassParse } from '../config/parser.ts';
import { load } from '../plugins/load.ts';
import BaseSourcePlugin from '../plugins/source/base.ts';
import BaseDestinationPlugin from '../plugins/destination/base.ts';

export default async function app({ configFile }: { configFile: string }) {
  const { config } = await firstPassParse(configFile);

  const sourcePlugins = await load<BaseSourcePlugin>(config.source_plugin_dir);
  const destinationPlugins = await load<BaseDestinationPlugin>(config.destination_plugin_dir);

  console.log(sourcePlugins);
  console.log('Checker WIP');
}
