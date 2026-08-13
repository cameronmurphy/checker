import scaffoldConfig from '../../../src/cli/scaffold.ts';
import configure from '../../../src/plugins/configure.ts';
import builtInDestinations from '../../../src/plugins/destination/built-ins.ts';
import builtInSources from '../../../src/plugins/source/built-ins.ts';
import { buildSecondPassSchema, toContexts } from '../../../src/config/schema.ts';
import { parse as parseYaml } from '@std/yaml';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { join } from '@std/path';

const EXAMPLE_CONFIG = new URL('../../../config.example.yml', import.meta.url);

async function withTempDir(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir();

  try {
    await body(dir);
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

Deno.test('a first run writes the example config where the config was meant to be', async () => {
  await withTempDir(async (dir) => {
    const configFile = join(dir, 'checker', 'config.yml');

    assertEquals(await scaffoldConfig(configFile), configFile);
    assertEquals(await Deno.readTextFile(configFile), await Deno.readTextFile(EXAMPLE_CONFIG));
  });
});

Deno.test('a config that already exists is left exactly as it is', async () => {
  await withTempDir(async (dir) => {
    const configFile = join(dir, 'config.yml');
    await Deno.writeTextFile(configFile, "config:\n  sources:\n    github:\n      items: ['a/b']\n");

    assertEquals(await scaffoldConfig(configFile), null);
    assertStringIncludes(await Deno.readTextFile(configFile), "items: ['a/b']");
  });
});

Deno.test('the example that ships runs as it stands, needing no credentials', async () => {
  const sources = builtInSources.map((SourceClass) => new SourceClass());
  const destinations = builtInDestinations.map((DestinationClass) => new DestinationClass());

  const { config } = buildSecondPassSchema(sources, destinations)
    .parse(parseYaml(await Deno.readTextFile(EXAMPLE_CONFIG)) as object);

  const [context] = configure(toContexts(config), builtInSources, builtInDestinations);

  // Everything else in the example is commented out, so a first run watches the ISS and logs it.
  assertEquals(context.name, 'default');
  assertEquals(context.sources.map((source) => source.getAlias()), ['json']);
  assertEquals(context.destinations.map((destination) => destination.getAlias()), ['log_file']);
  assertEquals(context.sources[0].getConfig().items, ['http://api.open-notify.org/iss-now.json#/iss_position']);
});
