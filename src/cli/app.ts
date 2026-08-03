import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import type { ConfiguredContext } from '../plugins/configure.ts';
import ErrorReporter from './error-reporter.ts';
import checkSource from './check.ts';
import loadContexts from './load-contexts.ts';
import watchConfigFile from './watch-config.ts';
import { closeState } from '../db/state.ts';
import { captureErrors } from '../db/errors.ts';
import { describeError } from '../utils/format.ts';

export default async function app({ configFile }: { configFile: string }) {
  captureErrors();

  let timers: ReturnType<typeof setInterval>[] = [];
  let fingerprints = new Map<string, string>();
  let contexts: ConfiguredContext[] = [];
  const reporter = new ErrorReporter();

  const apply = async (reason: string) => {
    contexts = await loadContexts(configFile);
    reporter.sync(contexts);

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

        const key = `${name}/${source.getAlias()}`;
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

    await reporter.report();
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
