import app from '../../../src/cli/app.ts';
import * as mock from '@std/testing/mock';
import { emitConfigEvent, setConfig, setup, tearDown } from '../../mocks.ts';

async function waitFor(condition: () => boolean, timeoutMs = 5000) {
  const deadline = performance.now() + timeoutMs;

  while (!condition()) {
    if (performance.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

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

Deno.test({
  name: 'app picks up a source added to the config file without a restart',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    const consoleLogStub = mock.stub(console, 'log');
    const fetchStub = mock.stub(
      globalThis,
      'fetch',
      () => Promise.resolve(new Response(JSON.stringify({ tag_name: 'v1.0.0', version: '1.0.0' }), { status: 200 })),
    );

    try {
      await app({ configFile: '~/.config/checker/config.yml' });

      setConfig(`
config:
  sources:
    github:
      items:
        - 'vercel/next.js'
    npm:
      items:
        - 'filepond'
  destinations:
    pushover:
      token: 'abcd1234'
      user_key: 'efgh5678'
`);
      emitConfigEvent();

      await waitFor(() => consoleLogStub.calls.some((c) => String(c.args[0]).startsWith('Config reloaded')));
    } finally {
      fetchStub.restore();
      consoleLogStub.restore();
      tearDown();
    }

    const reloadCall = consoleLogStub.calls.find((c) => String(c.args[0]).startsWith('Config reloaded'));

    // Only the newly added source should be checked out of band; github's config didn't move.
    if (String(reloadCall?.args[0]) !== 'Config reloaded — monitoring 2 source(s), checking 1 now') {
      throw new Error(`Unexpected reload log: ${reloadCall?.args[0]}`);
    }
  },
});

Deno.test({
  name: 'app keeps the previous config when a reload fails to parse',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    const consoleLogStub = mock.stub(console, 'log');
    const consoleErrorStub = mock.stub(console, 'error');
    const fetchStub = mock.stub(
      globalThis,
      'fetch',
      () => Promise.resolve(new Response(JSON.stringify({ tag_name: 'v1.0.0' }), { status: 200 })),
    );

    try {
      await app({ configFile: '~/.config/checker/config.yml' });

      setConfig('config:\n  sources:\n    github:\n      items: 42\n  destinations: {}\n');
      emitConfigEvent();

      await waitFor(() => consoleErrorStub.calls.some((c) => String(c.args[0]).startsWith('Config reload failed')));
    } finally {
      fetchStub.restore();
      consoleErrorStub.restore();
      consoleLogStub.restore();
      tearDown();
    }

    if (consoleLogStub.calls.some((c) => String(c.args[0]).startsWith('Config reloaded'))) {
      throw new Error('An invalid config should not have been applied');
    }
  },
});
