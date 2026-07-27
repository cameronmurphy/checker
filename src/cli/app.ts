import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import configure from '../plugins/configure.ts';
import { firstPassParse, secondPassParse } from '../config/parser.ts';
import { load } from '../plugins/load.ts';
import { closeState, getItemState, setItemState } from '../db/state.ts';
import builtInSources from '../plugins/source/built-ins.ts';
import builtInDestinations from '../plugins/destination/built-ins.ts';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function checkItem(
  source: BaseSourcePlugin,
  destinations: BaseDestinationPlugin[],
  pluginName: string,
  item: string,
) {
  const current = await source.read(item);
  if (!current) return;

  const previous = await getItemState(pluginName, item);

  if (previous !== null && !source.updated(previous, current)) return;

  const msg = source.message(previous ?? '', current, item);
  console.log(msg);

  const config = source.getConfig();
  const targetDestinations = config.destinations
    ? destinations.filter((d) => config.destinations!.includes(d.getName()))
    : destinations;

  const delivered = await Promise.all(
    targetDestinations.map((dest) =>
      dest.notify(msg).catch((error) => {
        console.error(`Destination ${dest.getName()} failed: ${describeError(error)}`);
        return false;
      })
    ),
  );

  // Leave the stored state alone when nothing got through, so the next check retries
  // instead of silently swallowing the update.
  if (targetDestinations.length > 0 && !delivered.some(Boolean)) {
    console.error(`No destination accepted the update for ${item}, retrying on next check`);
    return;
  }

  await setItemState(pluginName, item, current);
}

async function checkSource(
  source: BaseSourcePlugin,
  destinations: BaseDestinationPlugin[],
) {
  const pluginName = source.getName();
  const items: string[] = source.getConfig().items ?? [''];

  for (const item of items) {
    try {
      await checkItem(source, destinations, pluginName, item);
    } catch (error) {
      console.error(`Check failed for ${pluginName}/${item}: ${describeError(error)}`);
    }
  }
}

export default async function app({ configFile }: { configFile: string }) {
  const { config } = await firstPassParse(configFile);

  const allSources = [...builtInSources, ...await load<BaseSourcePlugin>(config.source_plugin_dir)];
  const allDestinations = [
    ...builtInDestinations,
    ...await load<BaseDestinationPlugin>(config.destination_plugin_dir),
  ];

  const { config: finalConfig } = await secondPassParse(configFile, allSources, allDestinations);
  const { sources, destinations } = configure(finalConfig, allSources, allDestinations);

  console.log(`Checker started — monitoring ${sources.length} source(s)`);

  for (const source of sources) {
    await checkSource(source, destinations);
  }

  for (const source of sources) {
    const interval = (source.getConfig().interval ?? 3600) * 1000;
    setInterval(() => {
      checkSource(source, destinations).catch((error) => {
        console.error(`Scheduled check failed: ${describeError(error)}`);
      });
    }, interval);
  }

  const shutdown = () => {
    console.log('\nShutting down...');
    closeState();
    Deno.exit(0);
  };

  Deno.addSignalListener('SIGINT', shutdown);
  Deno.addSignalListener('SIGTERM', shutdown);
}
