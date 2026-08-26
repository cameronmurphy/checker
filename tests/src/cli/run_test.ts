import app from '../../../src/cli/app.ts';
import { assertEquals } from '@std/assert';
import * as mock from '@std/testing/mock';
import { emitConfigEvent, setConfig, setup, tearDown } from '../../mocks.ts';

// Only github's release list answers with an array. Its designated-latest endpoint reads one
// release and npm reads one package document, and a single object serves both. Anything else here
// is a destination being notified, which only cares that the request succeeded.
function releaseResponse(input: string | URL | Request): Promise<Response> {
  const body = String(input).includes('/releases?')
    ? [{ tag_name: 'v1.0.0' }]
    : { tag_name: 'v1.0.0', version: '1.0.0' };

  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

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
      releaseResponse,
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
  name: 'app serves commands while the first sweep is still going',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();

    const consoleLogStub = mock.stub(console, 'log');
    const consoleErrorStub = mock.stub(console, 'error');

    // The first read finishes only when told to, standing in for a sweep stuck on a wedged
    // filesystem. Everything after it answers normally, so releasing the hold lets the sweep run to
    // completion instead of wedging on whatever request the read goes on to make.
    const holds: { input: string | URL | Request; resolve: (response: Response) => void }[] = [];
    const fetchStub = mock.stub(
      globalThis,
      'fetch',
      (input: string | URL | Request) =>
        holds.length > 0 ? releaseResponse(input) : new Promise<Response>((resolve) => holds.push({ input, resolve })),
    );

    try {
      const running = app({ configFile: '~/.config/checker/config.yml' });

      // The socket attempt is the proof: gated behind the sweep, it cannot happen while a read
      // holds. It fails under the mocked HOME, and that failure names the path it tried.
      await waitFor(() => consoleErrorStub.calls.some((c) => String(c.args[0]).includes('Not serving commands')));
      assertEquals(holds.length > 0, true);

      for (const { input, resolve } of holds) resolve(await releaseResponse(input));
      await running;
    } finally {
      fetchStub.restore();
      consoleErrorStub.restore();
      consoleLogStub.restore();
      tearDown();
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
      releaseResponse,
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
      releaseResponse,
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
