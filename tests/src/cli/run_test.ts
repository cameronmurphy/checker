import run from '../../../src/cli/run.ts';
import { mock } from '../../../dev_deps.ts';
import { setup, tearDown } from '../../mocks.ts';

Deno.test('outputs something', async () => {
  setup();

  const consoleLogStub = mock.stub(console, 'log');
  await run();

  mock.assertSpyCall(consoleLogStub, 0, {
    args: ['Checker WIP'],
  });

  tearDown();
});
