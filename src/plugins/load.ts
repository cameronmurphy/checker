import { expand } from '../utils/path.ts';
import { fsWalk } from '../../deps.ts';

export async function load<T>(path: string): Promise<T[]> {
  const plugins: T[] = [];
  const absolutePath = expand(path);

  for await (const entry of fsWalk(absolutePath, { exts: ['.ts'] })) {
    const { default: PluginClass } = await import(entry.path);

    if (PluginClass) {
      const instance = new PluginClass();
      plugins.push(instance);
    } else {
      console.error(`Plugin at ${absolutePath} is invalid`);
    }
  }

  return plugins;
}
