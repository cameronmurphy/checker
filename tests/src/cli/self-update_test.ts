import selfUpdate, { exercise } from '../../../src/cli/self-update.ts';
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

Deno.test('self-update says so when the downloaded binary will not run', async () => {
  await assertRejects(
    () => exercise('/nonexistent/checker'),
    Error,
    'The downloaded binary would not run',
  );
});

Deno.test('self-update accepts a binary that runs', async () => {
  // Whatever is running these tests answers --version, which is all the check asks of a download.
  await exercise(Deno.execPath());
});
