import { mock, mockFile } from '../dev_deps.ts';

let stubs: mock.Stub[] = [];

const mockConfig = `config:
  sources:
    github:
  destinations:
    pushover:
`;

export function setup() {
  stubs.push(mock.stub(Deno.env, 'get', (variable: string) => variable === 'HOME' ? '/usr/test' : undefined));

  const encoder = new TextEncoder();
  mockFile.prepareVirtualFile('/usr/test/.config/checker/config.yml', encoder.encode(mockConfig));
}

export function tearDown() {
  stubs.map((stub) => stub.restore());
  stubs = [];
}
