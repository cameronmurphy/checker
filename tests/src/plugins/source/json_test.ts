import { JsonSource } from '../../../../src/plugins/source/json.ts';
import * as mock from '@std/testing/mock';
import { assertEquals } from '@std/assert';

const ISS = 'http://api.open-notify.org/iss-now.json';
const POSITION = `${ISS}#/iss_position`;
const BODY = '{"message": "success", "iss_position": {"longitude": "14.7064", "latitude": "-29.4234"}, ' +
  '"timestamp": 1786582877}';

type Comparator = 'case_insensitive' | 'int' | 'semver';

function source(items: string[] = [POSITION], comparator: Comparator = 'case_insensitive'): JsonSource {
  const plugin = new JsonSource();
  plugin.setConfig({ interval: 3600, items, comparator });
  return plugin;
}

async function read(item: string, body = BODY, status = 200): Promise<string> {
  const plugin = source([item]);
  const fetchStub = mock.stub(globalThis, 'fetch', () => Promise.resolve(new Response(body, { status })));

  try {
    return await plugin.read(item);
  } finally {
    fetchStub.restore();
  }
}

Deno.test('json source stores the value the pointer addresses', async () => {
  assertEquals(await read(`${ISS}#/timestamp`), '1786582877');
  assertEquals(await read(`${ISS}#/message`), 'success');
  assertEquals(await read(`${ISS}#/iss_position/latitude`), '-29.4234');
});

Deno.test('json source keeps a subtree as one value, in a stable order', async () => {
  const expected = '{"latitude":"-29.4234","longitude":"14.7064"}';

  assertEquals(await read(POSITION), expected);

  // The document says longitude first; a server reordering its keys is not a change worth reporting.
  const reordered = '{"iss_position": {"latitude": "-29.4234", "longitude": "14.7064"}}';
  assertEquals(await read(POSITION, reordered), expected);
});

Deno.test('json source takes the leading slash as optional, and indexes arrays', async () => {
  assertEquals(await read(`${ISS}#iss_position/latitude`), '-29.4234');
  assertEquals(await read(`${ISS}#/people/1/name`, '{"people": [{"name": "Oleg"}, {"name": "Sunita"}]}'), 'Sunita');
});

Deno.test('json source unescapes a key that contains a slash or a tilde', async () => {
  assertEquals(await read(`${ISS}#/a~1b`, '{"a/b": "slash"}'), 'slash');
  assertEquals(await read(`${ISS}#/a~0b`, '{"a~b": "tilde"}'), 'tilde');
  assertEquals(await read(`${ISS}#/first name`, '{"first name": "Oleg"}'), 'Oleg');
});

Deno.test('json source stores the whole document when no pointer narrows it', async () => {
  assertEquals(await read(ISS, '{"b": 2, "a": 1}'), '{"a":1,"b":2}');
});

Deno.test('json source returns nothing rather than a value when the read cannot be trusted', async () => {
  assertEquals(await read(POSITION, BODY, 503), '');
  assertEquals(await read(POSITION, '<html>down for maintenance</html>'), '');
  assertEquals(await read(`${ISS}#/iss_speed`), '');
  assertEquals(await read(`${ISS}#/message/nested`), '');
});

Deno.test('json source refuses a value too big to belong in state', async () => {
  const wide = JSON.stringify({ items: Array.from({ length: 200 }, (_, index) => `item-${index}`) });

  assertEquals(await read(`${ISS}#/items`, wide), '');
  assertEquals(await read(`${ISS}#/items/0`, wide), 'item-0');
});

Deno.test('json source notifies on any change by default', () => {
  const plugin = source();

  assertEquals(plugin.updated('', '{"latitude":"1"}'), true);
  assertEquals(plugin.updated('{"latitude":"1"}', '{"latitude":"2"}'), true);
  assertEquals(plugin.updated('{"latitude":"1"}', '{"latitude":"1"}'), false);
});

Deno.test('json source can hold out for a climbing value instead', () => {
  assertEquals(source([POSITION], 'semver').updated('1.2.3', '1.2.4'), true);
  assertEquals(source([POSITION], 'semver').updated('1.2.4', '1.2.3'), false);
  assertEquals(source([POSITION], 'int').updated('41', '42'), true);
  assertEquals(source([POSITION], 'int').updated('42', '41'), false);
});

Deno.test('json source names the document and the path it watched in messages', () => {
  const plugin = source();

  assertEquals(
    plugin.message('', '{"latitude":"-29.4234"}', POSITION),
    'iss-now.json#/iss_position: first seen value is {"latitude":"-29.4234"}',
  );
  assertEquals(
    plugin.message('12.0', '13.0', `${ISS}#/iss_position/latitude`),
    'iss-now.json#/iss_position/latitude: 13.0 (was 12.0)',
  );
});

Deno.test('json source rejects items that are not URLs', () => {
  const schema = source().getSchema();

  assertEquals(schema.safeParse({ interval: 3600, items: [POSITION] }).success, true);
  assertEquals(schema.safeParse({ interval: 3600, items: ['iss-now.json#/iss_position'] }).success, false);
  assertEquals(schema.safeParse({ interval: 3600, items: [] }).success, false);
});

Deno.test('json source defaults the comparator when the config omits it', () => {
  const parsed = new JsonSource().getSchema().parse({ interval: 3600, items: [POSITION] });

  assertEquals(parsed.comparator, 'case_insensitive');
});
