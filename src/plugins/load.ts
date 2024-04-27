import { expand } from '../utils/path.ts';
import { fsExistsSync, fsWalk } from '../../deps.ts';

export async function load<T>(path: string): Promise<T[]> {
  const plugins: T[] = [];
  const absolutePath = expand(path);

  if (!fsExistsSync(absolutePath) || !Deno.statSync(absolutePath).isDirectory) {
    return plugins;
  }

  for await (const entry of fsWalk(absolutePath, { exts: ['.ts'] })) {
    const { default: PluginClass } = await import(entry.path);

    if (PluginClass) {
      plugins.push(new PluginClass());
    } else {
      console.error(`Plugin at ${absolutePath} is invalid`);
    }
  }

  return plugins;
}
