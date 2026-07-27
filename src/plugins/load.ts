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
    try {
      const { default: PluginClass } = await import(entry.path);

      if (PluginClass) {
        plugins.push(new PluginClass());
      } else {
        console.error(`Plugin at ${entry.path} is invalid`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Plugin at ${entry.path} failed to load: ${message}`);
    }
  }

  return plugins;
}
