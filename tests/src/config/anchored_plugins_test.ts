import { secondPassParse } from '../../../src/config/parser.ts';
import { toContexts } from '../../../src/config/schema.ts';
import configure from '../../../src/plugins/configure.ts';
import builtInSources from '../../../src/plugins/source/built-ins.ts';
import builtInDestinations from '../../../src/plugins/destination/built-ins.ts';
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { join } from '@std/path';

// Stamping happens in the parser rather than the schema, so these go through a file to exercise the
// path the daemon actually takes.
async function contextsFrom(yaml: string) {
  const dir = await Deno.makeTempDir();
  const path = join(dir, 'config.yml');

  await Deno.writeTextFile(path, yaml);

  try {
    const { config } = await secondPassParse(
      path,
      builtInSources.map((SourceClass) => new SourceClass()),
      builtInDestinations.map((DestinationClass) => new DestinationClass()),
    );

    return configure(toContexts(config), builtInSources, builtInDestinations);
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

const ANCHORED = `
config:
  contexts:
    one:
      sources:
        github:
          items: ['a/b']
      destinations:
        log_file: &shared
          path: '~/one.log'
    two:
      sources:
        npm:
          items: ['vite']
      destinations:
        log_file_from_one: *shared
`;

Deno.test('an aliased destination brings its plugin to the name another context gives it', async () => {
  const [, two] = await contextsFrom(ANCHORED);

  // The alias is written under a name that is not a plugin, and never says which plugin it is.
  assertEquals(two.destinations.map((destination) => destination.getAlias()), ['log_file_from_one']);
  assertEquals(two.destinations.map((destination) => destination.getName()), ['log_file']);
});

Deno.test('the definition the anchor sits on keeps working as itself', async () => {
  const [one] = await contextsFrom(ANCHORED);

  assertEquals(one.destinations.map((destination) => destination.getName()), ['log_file']);
});

Deno.test('an explicit plugin still wins over the name the definition was keyed by', async () => {
  const [context] = await contextsFrom(`
config:
  contexts:
    one:
      sources:
        github:
          items: ['a/b']
      destinations:
        log_file:
          plugin: pushover
          token: 't'
          user_key: 'u'
`);

  assertEquals(context.destinations.map((destination) => destination.getName()), ['pushover']);
});

Deno.test('a definition keyed by a name that is no plugin still has to say which it is', async () => {
  // Nothing to infer from: this is a definition rather than an alias of one, so it names no plugin.
  const error = await assertRejects(() =>
    contextsFrom(`
config:
  contexts:
    one:
      sources:
        github:
          items: ['a/b']
      destinations:
        somewhere_else:
          path: '~/one.log'
`)
  );

  assertStringIncludes(String(error), 'Unknown destination plugin');
  assertStringIncludes(String(error), 'somewhere_else');
});

Deno.test('a source aliased across contexts carries its plugin the same way', async () => {
  const [, two] = await contextsFrom(`
config:
  contexts:
    one:
      sources:
        github: &watched
          items: ['a/b']
      destinations:
        log_file:
          path: '~/one.log'
    two:
      sources:
        github_again: *watched
      destinations:
        log_file:
          path: '~/two.log'
`);

  assertEquals(two.sources.map((source) => source.getAlias()), ['github_again']);
  assertEquals(two.sources.map((source) => source.getName()), ['github']);
});
