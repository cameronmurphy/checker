import { dirname } from '@std/path/dirname';
import { ensureDir } from '@std/fs/ensure-dir';
import { expand } from '../utils/path.ts';
import { DEFAULT_CONTEXT } from '../constants.ts';

const STATE_DB_PATH = '~/.config/checker/state.db';

let kv: Deno.Kv;

export async function openState(): Promise<Deno.Kv> {
  if (!kv) {
    const path = expand(STATE_DB_PATH);
    await ensureDir(dirname(path));
    kv = await Deno.openKv(path);
  }
  return kv;
}

function itemKey(context: string, pluginName: string, item: string): Deno.KvKey {
  return context === DEFAULT_CONTEXT ? [pluginName, item] : [context, pluginName, item];
}

export async function getItemState(context: string, pluginName: string, item: string): Promise<string | null> {
  const db = await openState();
  const entry = await db.get<string>(itemKey(context, pluginName, item));
  return entry.value;
}

export async function setItemState(
  context: string,
  pluginName: string,
  item: string,
  value: string,
): Promise<void> {
  const db = await openState();
  await db.set(itemKey(context, pluginName, item), value);
}

export function closeState(): void {
  if (kv) {
    kv.close();
  }
}
