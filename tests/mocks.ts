import * as mock from '@std/testing/mock';

let stubs: mock.Stub[] = [];

const mockConfig = `
config:
  sources:
    github:
      items:
        - 'vercel/next.js'
  destinations:
    pushover:
      token: 'abcd1234'
      user_key: 'efgh5678'
`;

export const MOCK_CONFIG_PATH = '/usr/test/.config/checker/config.yml';

let currentConfig = mockConfig;
let emitEvent: ((event: Deno.FsEvent) => void) | null = null;

export function setConfig(yaml: string) {
  currentConfig = yaml;
}

export function emitConfigEvent(path = MOCK_CONFIG_PATH) {
  emitEvent?.({ kind: 'modify', paths: [path] });
}

function stubWatcher(): Deno.FsWatcher {
  const queued: Deno.FsEvent[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  emitEvent = (event) => {
    queued.push(event);
    wake?.();
    wake = null;
  };

  return {
    close() {
      closed = true;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        if (queued.length === 0) {
          await new Promise<void>((resolve) => wake = resolve);
        }
        while (queued.length > 0) yield queued.shift()!;
      }
    },
  } as unknown as Deno.FsWatcher;
}

export function setup() {
  stubs.push(mock.stub(Deno.env, 'get', (variable: string) => variable === 'HOME' ? '/usr/test' : undefined));

  const encoder = new TextEncoder();
  stubs.push(mock.stub(Deno, 'readFile', () => Promise.resolve(new Uint8Array(encoder.encode(currentConfig)))));

  // The state module ensures its parent directory exists; keep that off the real filesystem.
  stubs.push(mock.stub(Deno, 'mkdir', () => Promise.resolve()));

  // The config directory doesn't exist under the mocked HOME, so a real watch can't be opened.
  stubs.push(mock.stub(Deno, 'watchFs', stubWatcher));

  const originalOpenKv = Deno.openKv.bind(Deno);
  stubs.push(mock.stub(Deno, 'openKv', (_path?: string) => originalOpenKv(':memory:')));
}

export function tearDown() {
  stubs.map((stub) => stub.restore());
  stubs = [];
  currentConfig = mockConfig;
  emitEvent = null;
}
