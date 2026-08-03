import { expand } from '../utils/path.ts';
import { describeError } from '../utils/format.ts';
import { basename, dirname } from '@std/path';

const RELOAD_DEBOUNCE_MS = 500;

// Watching the directory rather than the config file itself survives the write-to-temp-then-rename
// that editors save with, which swaps out the inode a file watch was holding.
export default function watchConfigFile(configFile: string, reload: () => void): Deno.FsWatcher | null {
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
