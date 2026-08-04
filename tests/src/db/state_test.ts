import { collectOrphans, getItemState, openState, setItemState } from '../../../src/db/state.ts';
import { setup, tearDown } from '../../mocks.ts';
import { assertEquals } from '@std/assert';

Deno.test({
  name: 'the default context reads and writes the pre-context key shape',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    try {
      // Written the way checker did before contexts existed.
      const db = await openState();
      await db.set(['legacy_source', 'item-a'], 'v1');

      // The default context must find it, or upgrading re-reports everything as first seen.
      assertEquals(await getItemState('default', 'legacy_source', 'item-a'), 'v1');

      await setItemState('default', 'legacy_source', 'item-b', 'v2');
      assertEquals((await db.get<string>(['legacy_source', 'item-b'])).value, 'v2');
    } finally {
      tearDown();
    }
  },
});

Deno.test({
  name: 'two contexts watching the same plugin and item keep separate state',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    try {
      await setItemState('default', 'shared_source', 'nginx', 'from-default');
      await setItemState('myapp', 'shared_source', 'nginx', 'from-myapp');

      assertEquals(await getItemState('default', 'shared_source', 'nginx'), 'from-default');
      assertEquals(await getItemState('myapp', 'shared_source', 'nginx'), 'from-myapp');

      // A context that has never seen the item reads null, so it notifies on its own schedule
      // rather than inheriting another context's history.
      assertEquals(await getItemState('other', 'shared_source', 'nginx'), null);
    } finally {
      tearDown();
    }
  },
});

Deno.test({
  name: 'a named context does not collide with the default context key space',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    try {
      const db = await openState();
      await setItemState('myapp', 'keyspace_source', 'x', 'named');

      assertEquals((await db.get<string>(['keyspace_source', 'x'])).value, null);
      assertEquals((await db.get<string>(['myapp', 'keyspace_source', 'x'])).value, 'named');
    } finally {
      tearDown();
    }
  },
});

const HOUR = 60 * 60 * 1000;
const START = 1_800_000_000_000;

Deno.test({
  name: 'orphaned state is forgotten only after it has been gone for the retention window',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    try {
      await setItemState('wrx', 'npm', 'kept', 'v1');
      await setItemState('wrx', 'npm', 'dropped', 'v1');

      const watched = [
        { context: 'wrx', plugin: 'npm', item: 'kept' },
        { context: 'wrx', plugin: 'npm', item: 'dropped' },
      ];

      // Both watched, so both are recorded and the window starts from here.
      await collectOrphans(watched, START);

      const live = [watched[0]];
      const early = await collectOrphans(live, START + 47 * HOUR).then((keys) => keys.map((key) => key.join('/')));

      assertEquals(early.includes('wrx/npm/dropped'), false);
      assertEquals(await getItemState('wrx', 'npm', 'dropped'), 'v1');

      // Other tests in this file share the one state database, so assert on what happened to these
      // two items rather than on the whole collected list.
      const collected = await collectOrphans(live, START + 49 * HOUR).then((keys) => keys.map((key) => key.join('/')));

      assertEquals(collected.includes('wrx/npm/dropped'), true);
      assertEquals(collected.includes('wrx/npm/kept'), false);
      assertEquals(await getItemState('wrx', 'npm', 'dropped'), null);
      assertEquals(await getItemState('wrx', 'npm', 'kept'), 'v1');
    } finally {
      tearDown();
    }
  },
});

Deno.test({
  name: 'an item that comes back before the window closes keeps its history',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    try {
      await setItemState('wrx', 'npm', 'flaky', 'v1');
      const watched = [{ context: 'wrx', plugin: 'npm', item: 'flaky' }];

      // Commented out of the config, then restored: the clock resets, so it never notifies again
      // as first seen.
      await collectOrphans(watched, START);
      await collectOrphans([], START + 20 * HOUR);
      await collectOrphans(watched, START + 40 * HOUR);
      await collectOrphans([], START + 41 * HOUR);

      const collected = await collectOrphans([], START + 80 * HOUR).then((keys) => keys.map((key) => key.join('/')));

      // 80 hours after it first appeared, but only 39 since it was last watched.
      assertEquals(collected.includes('wrx/npm/flaky'), false);
      assertEquals(await getItemState('wrx', 'npm', 'flaky'), 'v1');
    } finally {
      tearDown();
    }
  },
});

Deno.test({
  name: 'collecting handles the default context key shape and leaves its bookkeeping behind',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    try {
      await setItemState('default', 'github', 'tus/tusd', 'v1');

      // Never recorded as watched, so it predates the bookkeeping and goes on the first sweep
      // rather than waiting out a window it was never inside.
      const collected = await collectOrphans([], START).then((keys) => keys.map((key) => key.join('/')));

      // The two-element key the default context uses, not 'default/github/tus/tusd'.
      assertEquals(collected.includes('github/tus/tusd'), true);
      assertEquals(await getItemState('default', 'github', 'tus/tusd'), null);

      // Nothing of the collected item is left, including the timestamp that tracked it.
      const db = await openState();
      const remaining = [];
      for await (const entry of db.list({ prefix: [] })) remaining.push(entry.key.join('/'));
      assertEquals(remaining.filter((key) => key.includes('tus/tusd')), []);
    } finally {
      tearDown();
    }
  },
});
