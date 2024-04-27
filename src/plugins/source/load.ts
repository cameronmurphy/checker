import BaseSourcePlugin from './base.ts';
import { expand } from '../../utils/path.ts';
import { fsWalk } from '../../../deps.ts';

export async function load(path: string): BaseSourcePlugin[] {
  const plugins: BaseSourcePlugin[] = [];

  const absolutePath = expand(path);

  for await (const entry of fsWalk(absolutePath, { exts: ['.ts'] })) {
    const { default: PluginClass } = await import(entry.path);
    if (PluginClass.prototype instanceof BaseSourcePlugin) {
      const instance = new PluginClass();
      plugins.push(instance);
    }
  }

  return plugins;
}
