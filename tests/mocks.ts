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

export function setup() {
  stubs.push(mock.stub(Deno.env, 'get', (variable: string) => variable === 'HOME' ? '/usr/test' : undefined));

  const encoder = new TextEncoder();
  const configData = new Uint8Array(encoder.encode(mockConfig));

  stubs.push(mock.stub(Deno, 'readFile', () => Promise.resolve(configData)));

  // The state module ensures its parent directory exists; keep that off the real filesystem.
  stubs.push(mock.stub(Deno, 'mkdir', () => Promise.resolve()));

  const originalOpenKv = Deno.openKv.bind(Deno);
  stubs.push(mock.stub(Deno, 'openKv', (_path?: string) => originalOpenKv(':memory:')));
}

export function tearDown() {
  stubs.map((stub) => stub.restore());
  stubs = [];
}
