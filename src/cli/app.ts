import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import configure, { type ConfiguredContext, type PluginClass } from '../plugins/configure.ts';
import { firstPassParse, secondPassParse } from '../config/parser.ts';
import { toContexts } from '../config/schema.ts';
import { load } from '../plugins/load.ts';
import { closeState, getItemState, setItemState } from '../db/state.ts';
import builtInSources from '../plugins/source/built-ins.ts';
import builtInDestinations from '../plugins/destination/built-ins.ts';
import { expand } from '../utils/path.ts';
import { DEFAULT_CONTEXT } from '../constants.ts';
import { basename, dirname } from '@std/path';

const RELOAD_DEBOUNCE_MS = 500;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function contextLabel(context: string): string {
  return context === DEFAULT_CONTEXT ? '' : `[${context}] `;
}

async function checkItem(
  context: string,
  source: BaseSourcePlugin,
  destinations: BaseDestinationPlugin[],
  pluginName: string,
  item: string,
) {
  const current = await source.read(item);
  if (!current) return;

  const previous = await getItemState(context, pluginName, item);

  if (previous !== null && !source.updated(previous, current)) return;

  const msg = source.message(previous ?? '', current, item);
  console.log(`${contextLabel(context)}${msg}`);

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
    console.error(
      `${contextLabel(context)}No destination accepted the update for ${item}, retrying on next check`,
    );
    return;
  }

  await setItemState(context, pluginName, item, current);
}

async function checkSource(
  context: string,
  source: BaseSourcePlugin,
  destinations: BaseDestinationPlugin[],
) {
  const pluginName = source.getName();
  const items: string[] = source.getConfig().items ?? [''];

  for (const item of items) {
    try {
      await checkItem(context, source, destinations, pluginName, item);
    } catch (error) {
      console.error(`Check failed for ${contextLabel(context)}${pluginName}/${item}: ${describeError(error)}`);
    }
  }
}

async function loadConfiguredContexts(configFile: string): Promise<ConfiguredContext[]> {
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
    const contexts = await loadConfiguredContexts(configFile);

    const previous = fingerprints;
    fingerprints = new Map();
    timers.forEach(clearInterval);
    timers = [];

    // Only sources whose config actually moved get an immediate check, so saving the file repeatedly
    // doesn't hammer every remote the config mentions.
    const changed: { context: string; source: BaseSourcePlugin; destinations: BaseDestinationPlugin[] }[] = [];
    let monitored = 0;

    for (const { name, sources, destinations } of contexts) {
      for (const source of sources) {
        monitored++;

        const key = `${name}/${source.getName()}`;
        const fingerprint = JSON.stringify(source.getConfig());
        fingerprints.set(key, fingerprint);

        if (previous.get(key) !== fingerprint) {
          changed.push({ context: name, source, destinations });
        }

        timers.push(setInterval(() => {
          checkSource(name, source, destinations).catch((error) => {
            console.error(`Scheduled check failed: ${describeError(error)}`);
          });
        }, (source.getConfig().interval ?? 3600) * 1000));
      }
    }

    console.log(
      `${reason} — monitoring ${monitored} source(s)${changed.length ? `, checking ${changed.length} now` : ''}`,
    );

    for (const { context, source, destinations } of changed) {
      await checkSource(context, source, destinations);
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
