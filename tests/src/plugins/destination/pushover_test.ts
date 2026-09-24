import PushoverDestination from '../../../../src/plugins/destination/pushover.ts';
import * as mock from '@std/testing/mock';
import { assertEquals } from '@std/assert';

async function sent(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const plugin = new PushoverDestination();
  plugin.setConfig(plugin.getSchema().parse({ token: 'app-token', user_key: 'user-key', ...config }));

  const fetchStub = mock.stub(globalThis, 'fetch', () => Promise.resolve(new Response('{"status":1}')));

  try {
    assertEquals(await plugin.notify('Tickets available'), true);
    return JSON.parse(fetchStub.calls[0].args[1]?.body as string);
  } finally {
    fetchStub.restore();
  }
}

Deno.test('pushover destination sends the configured priority', async () => {
  assertEquals((await sent({ priority: 1 })).priority, 1);
  assertEquals((await sent({ priority: -2 })).priority, -2);
});

Deno.test('pushover destination leaves priority to Pushover when unset', async () => {
  assertEquals('priority' in await sent({}), false);
});

Deno.test('pushover destination rejects priorities it cannot send', () => {
  const schema = new PushoverDestination().getSchema();

  for (const priority of [2, -3, 1.5]) {
    assertEquals(schema.safeParse({ token: 'app-token', user_key: 'user-key', priority }).success, false);
  }
});
