import { mock } from '../dev_deps.ts';
import { run } from '../main.ts';

Deno.test('outputs something', async () => {
  const consoleLogStub = mock.stub(console, 'log');
  await run();

  mock.assertSpyCall(consoleLogStub, 0, {
    args: ['Checker WIP'],
  });
});
