import selfUpdate from '../../../src/cli/self-update.ts';
import { assertRejects } from '@std/assert';

Deno.test('self-update refuses to touch anything when checker is running from source', async () => {
  // Deno.execPath() is the deno binary here, and the tests run exactly that way, so this is the
  // guard doing its job rather than a mock of it.
  await assertRejects(
    () => selfUpdate(),
    Error,
    'running from source',
  );
});
