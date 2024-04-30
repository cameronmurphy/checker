import { mock, mockFile } from '../dev_deps.ts';

let stubs: mock.Stub[] = [];

const mockConfig = `
config:
  sources:
    github:
      items:
        - 'vercel/nextjs'
  destinations:
    pushover:
      token: 'abcd1234'
      user_key: 'efgh5678'
      rollup: '9pm'
`;

export function setup() {
  stubs.push(mock.stub(Deno.env, 'get', (variable: string) => variable === 'HOME' ? '/usr/test' : undefined));
  stubs.push(mock.stub(Deno, 'cwd', () => '/usr/test'));

  const encoder = new TextEncoder();
  mockFile.prepareVirtualFile('/usr/test/.config/checker/config.yml', encoder.encode(mockConfig));
  mockFile.prepareVirtualFile('/usr/test/.config/checker/plugins/source');
  mockFile.prepareVirtualFile('/usr/test/.config/checker/plugins/destination');
}

export function tearDown() {
  stubs.map((stub) => stub.restore());
  stubs = [];
}
