import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import configure from '../plugins/configure.ts';
import { firstPassParse, secondPassParse } from '../config/parser.ts';
import { load } from '../plugins/load.ts';
import { closeState, getItemState, setItemState } from '../db/state.ts';
import builtInSources from '../plugins/source/built-ins.ts';
import builtInDestinations from '../plugins/destination/built-ins.ts';
import { expand } from '../utils/path.ts';
import { basename, dirname } from '@std/path';

const RELOAD_DEBOUNCE_MS = 500;

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

async function loadConfiguredPlugins(configFile: string) {
  const { config } = await firstPassParse(configFile);

  const allSources = [...builtInSources, ...await load<BaseSourcePlugin>(config.source_plugin_dir)];
  const allDestinations = [
    ...builtInDestinations,
    ...await load<BaseDestinationPlugin>(config.destination_plugin_dir),
  ];

  const { config: finalConfig } = await secondPassParse(configFile, allSources, allDestinations);

  return configure(finalConfig, allSources, allDestinations);
}

// Watching the directory rather than the config file itself survives the write-to-temp-then-rename
// that editors save with, which swaps out the inode a file watch was holding.
function watchConfigFile(configFile: string, reload: () => void): Deno.FsWatcher | null {
  const path = expand(configFile);
  let watcher: Deno.FsWatcher;

  try {
    watcher = Deno.watchFs(dirname(path), { recursive: false });
  } catch (error) {
    console.error(`Not watching ${path} for changes: ${describeError(error)}`);
    return null;
  }

  (async () => {
    let pending: ReturnType<typeof setTimeout> | undefined;

    for await (const event of watcher) {
      if (event.kind === 'access') continue;
      if (!event.paths.some((eventPath) => basename(eventPath) === basename(path))) continue;

      clearTimeout(pending);
      pending = setTimeout(reload, RELOAD_DEBOUNCE_MS);
    }
  })().catch((error) => console.error(`Stopped watching ${path}: ${describeError(error)}`));

  return watcher;
}

export default async function app({ configFile }: { configFile: string }) {
  let timers: ReturnType<typeof setInterval>[] = [];
  let fingerprints = new Map<string, string>();

  const apply = async (reason: string) => {
    const { sources, destinations } = await loadConfiguredPlugins(configFile);

    const previous = fingerprints;
    fingerprints = new Map(sources.map((source) => [source.getName(), JSON.stringify(source.getConfig())]));

    // Only sources whose config actually moved get an immediate check, so saving the file repeatedly
    // doesn't hammer every remote the config mentions.
    const changed = sources.filter((source) => previous.get(source.getName()) !== fingerprints.get(source.getName()));

    timers.forEach(clearInterval);
    timers = sources.map((source) =>
      setInterval(() => {
        checkSource(source, destinations).catch((error) => {
          console.error(`Scheduled check failed: ${describeError(error)}`);
        });
      }, (source.getConfig().interval ?? 3600) * 1000)
    );

    console.log(
      `${reason} — monitoring ${sources.length} source(s)${changed.length ? `, checking ${changed.length} now` : ''}`,
    );

    for (const source of changed) {
      await checkSource(source, destinations);
    }
  };

  // Reloads queue behind whatever check is already running, so saving the config mid-sweep can't have
  // two passes racing to report the same item for the first time.
  let queued = apply('Checker started');
  await queued;

  const watcher = watchConfigFile(configFile, () => {
    queued = queued
      .then(() => apply('Config reloaded'))
      .catch((error) => {
        console.error(`Config reload failed, keeping the previous config: ${describeError(error)}`);
      });
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    watcher?.close();
    closeState();
    Deno.exit(0);
  };

  Deno.addSignalListener('SIGINT', shutdown);
  Deno.addSignalListener('SIGTERM', shutdown);
}
