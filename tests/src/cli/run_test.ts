import app from '../../../src/cli/app.ts';
import * as mock from '@std/testing/mock';
import { setup, tearDown } from '../../mocks.ts';

Deno.test({
  name: 'app starts and reports the number of configured sources',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    const consoleLogStub = mock.stub(console, 'log');
    const fetchStub = mock.stub(
      globalThis,
      'fetch',
      () => Promise.resolve(new Response(JSON.stringify({ tag_name: 'v1.0.0' }), { status: 200 })),
    );

    try {
      await app({ configFile: '~/.config/checker/config.yml' });
    } finally {
      fetchStub.restore();
      consoleLogStub.restore();
      tearDown();
    }

    const startupCall = consoleLogStub.calls.find((c) => String(c.args[0]).startsWith('Checker started'));
    if (!startupCall) {
      throw new Error('Expected startup log message');
    }
  },
});

Deno.test({
  name: 'app survives a source that throws instead of taking down the daemon',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    const consoleLogStub = mock.stub(console, 'log');
    const consoleErrorStub = mock.stub(console, 'error');
    const fetchStub = mock.stub(
      globalThis,
      'fetch',
      () => Promise.reject(new TypeError('simulated network failure')),
    );

    try {
      // Must resolve; an escaping rejection would terminate the process in production.
      await app({ configFile: '~/.config/checker/config.yml' });
    } finally {
      fetchStub.restore();
      consoleErrorStub.restore();
      consoleLogStub.restore();
      tearDown();
    }

    const loggedFailure = consoleErrorStub.calls.some((c) => String(c.args[0]).includes('simulated network failure'));
    if (!loggedFailure) {
      throw new Error('Expected the source failure to be logged');
    }
  },
});
