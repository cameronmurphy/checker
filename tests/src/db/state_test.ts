import { getItemState, openState, setItemState } from '../../../src/db/state.ts';
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
