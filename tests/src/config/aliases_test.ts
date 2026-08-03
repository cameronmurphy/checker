import configure from '../../../src/plugins/configure.ts';
import builtInDestinations from '../../../src/plugins/destination/built-ins.ts';
import builtInSources from '../../../src/plugins/source/built-ins.ts';
import { buildSecondPassSchema, toContexts } from '../../../src/config/schema.ts';
import { parse as parseYaml } from '@std/yaml';
import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert';

function parse(yaml: string) {
  const schema = buildSecondPassSchema(
    builtInSources.map((SourceClass) => new SourceClass()),
    builtInDestinations.map((DestinationClass) => new DestinationClass()),
  );

  return schema.parse(parseYaml(yaml) as object).config;
}

function contextsFrom(yaml: string) {
  return configure(toContexts(parse(yaml)), builtInSources, builtInDestinations);
}

Deno.test('a key without a plugin field names the plugin itself', () => {
  const [context] = contextsFrom(`
config:
  sources:
    github:
      items: ['a/b']
  destinations:
    log_file:
      path: '~/checker.log'
`);

  assertEquals(context.sources.map((source) => source.getAlias()), ['github']);
  assertEquals(context.destinations.map((destination) => destination.getAlias()), ['log_file']);
});

Deno.test('one plugin backs several destinations, each with its own config', () => {
  const [context] = contextsFrom(`
config:
  sources:
    github:
      items: ['a/b']
      destinations: [updates]
  errors:
    destinations: [failures]
  destinations:
    updates:
      plugin: log_file
      path: '~/updates.log'
    failures:
      plugin: log_file
      path: '~/failures.log'
`);

  assertEquals(context.destinations.map((destination) => destination.getAlias()), ['updates', 'failures']);
  assertEquals(context.destinations.map((destination) => destination.getName()), ['log_file', 'log_file']);
  assertEquals(
    context.destinations.map((destination) => (destination.getConfig() as { path: string }).path),
    ['~/updates.log', '~/failures.log'],
  );
});

Deno.test('one plugin backs several sources, each keeping its own state', () => {
  const [context] = contextsFrom(`
config:
  sources:
    fast:
      plugin: github
      interval: 60
      items: ['a/b']
    slow:
      plugin: github
      interval: 86400
      items: ['c/d']
`);

  assertEquals(context.sources.map((source) => source.getAlias()), ['fast', 'slow']);
  assertEquals(context.sources.map((source) => source.getConfig().items), [['a/b'], ['c/d']]);
});

Deno.test('the plugin key is not passed on to the plugin', () => {
  const [context] = contextsFrom(`
config:
  destinations:
    updates:
      plugin: log_file
      path: '~/updates.log'
`);

  assertEquals(context.destinations[0].getConfig(), { path: '~/updates.log' });
});

Deno.test('an unknown plugin is reported against the key that named it', () => {
  const error = assertThrows(() =>
    parse(`
config:
  destinations:
    updates:
      plugin: carrier_pigeon
`)
  );

  assertStringIncludes(String(error), 'Unknown destination plugin');
  assertStringIncludes(String(error), 'carrier_pigeon');
  assertStringIncludes(String(error), 'updates');
});

Deno.test('a destination that no key matches is rejected rather than silently skipped', () => {
  assertThrows(
    () =>
      contextsFrom(`
config:
  contexts:
    myapp:
      sources:
        github:
          items: ['a/b']
          destinations: [log_file]
      destinations:
        updates:
          plugin: log_file
          path: '~/updates.log'
`),
    Error,
    'Unknown destination "log_file" in context "myapp"',
  );
});

Deno.test('an errors block naming a destination that does not exist is rejected too', () => {
  assertThrows(
    () =>
      contextsFrom(`
config:
  errors:
    destinations: [failures]
  destinations:
    log_file:
      path: '~/checker.log'
`),
    Error,
    'Unknown destination "failures" in context "default"',
  );
});
