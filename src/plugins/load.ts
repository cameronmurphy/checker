import { expand } from '../utils/path.ts';
import { walk } from '@std/fs/walk';

export async function load<T>(path: string): Promise<T[]> {
  const plugins: T[] = [];
  const absolutePath = expand(path);

  try {
    const stat = await Deno.stat(absolutePath);
    if (!stat.isDirectory) return plugins;
  } catch {
    return plugins;
  }

  for await (const entry of walk(absolutePath, { exts: ['.ts'] })) {
    const { default: PluginClass } = await import(entry.path);

    if (PluginClass) {
      plugins.push(new PluginClass());
    } else {
      console.error(`Plugin at ${absolutePath} is invalid`);
    }
  }

  return plugins;
}
