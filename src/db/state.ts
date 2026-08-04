import { dirname } from '@std/path/dirname';
import { ensureDir } from '@std/fs/ensure-dir';
import { expand } from '../utils/path.ts';
import { DEFAULT_CONTEXT, ORPHAN_RETENTION_MS } from '../constants.ts';

const STATE_DB_PATH = '~/.config/checker/state.db';

// When each key was last part of the config, kept beside the state rather than in it so the stored
// values stay plain strings. The prefix is not a legal plugin name, which is what keeps it out of
// the key space real items occupy.
const SEEN_PREFIX = '__seen';

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

/** One item a context watches, as the config currently describes it. */
export type WatchedItem = { context: string; plugin: string; item: string };

/**
 * Forgets state for items the config no longer watches, once they have been gone for
 * {@linkcode ORPHAN_RETENTION_MS}. Renaming a source or dropping an item otherwise leaves its last
 * value behind forever. State that was already orphaned before the first sweep goes immediately.
 * Returns the keys collected.
 *
 * Only call this after the config has loaded: a parse failure that left every source unknown would
 * otherwise read as every item being orphaned at once.
 */
export async function collectOrphans(watched: WatchedItem[], now: number = Date.now()): Promise<Deno.KvKey[]> {
  const db = await openState();
  const live = new Set(
    watched.map(({ context, plugin, item }) => JSON.stringify(itemKey(context, plugin, item))),
  );
  const collected: Deno.KvKey[] = [];

  for await (const entry of db.list({ prefix: [] })) {
    if (entry.key[0] === SEEN_PREFIX) continue;

    const seenKey = [SEEN_PREFIX, ...entry.key];

    if (live.has(JSON.stringify(entry.key))) {
      await db.set(seenKey, now);
      continue;
    }

    const seen = await db.get<number>(seenKey);

    // The window is for state that was watched recently enough to be worth keeping through a source
    // being renamed or commented out. A key with no timestamp has never been watched while sweeping
    // was happening, so there is nothing to wait for — it predates this bookkeeping.
    if (typeof seen.value === 'number' && now - seen.value < ORPHAN_RETENTION_MS) continue;

    await db.delete(entry.key);
    await db.delete(seenKey);
    collected.push(entry.key);
  }

  return collected;
}

export function closeState(): void {
  if (kv) {
    kv.close();
  }
}
