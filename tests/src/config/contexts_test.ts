import { toContexts } from '../../../src/config/schema.ts';
import { assertEquals, assertThrows } from '@std/assert';

const plugin = (name: string, config: object = {}) => ({ [name]: { plugin: name, config } });

Deno.test('a config without contexts becomes a single default context', () => {
  const contexts = toContexts({
    sources: plugin('github', { items: ['vercel/next.js'] }),
    destinations: plugin('pushover', { token: 'abcd' }),
  });

  assertEquals(Object.keys(contexts), ['default']);
  assertEquals(contexts.default.sources, plugin('github', { items: ['vercel/next.js'] }));
  assertEquals(contexts.default.destinations, plugin('pushover', { token: 'abcd' }));
});

Deno.test('a config with only sources still yields a usable default context', () => {
  const contexts = toContexts({ sources: plugin('github') });

  assertEquals(contexts.default.sources, plugin('github'));
  assertEquals(contexts.default.destinations, {});
});

Deno.test('naming the default context explicitly is equivalent to omitting contexts', () => {
  const implicit = toContexts({
    sources: plugin('github', { items: ['a/b'] }),
    destinations: plugin('pushover', { token: 'x' }),
  });
  const explicit = toContexts({
    contexts: {
      default: {
        sources: plugin('github', { items: ['a/b'] }),
        destinations: plugin('pushover', { token: 'x' }),
      },
    },
  });

  assertEquals(explicit, implicit);
});

Deno.test('contexts are passed through untouched', () => {
  const contexts = toContexts({
    contexts: {
      myapp: { sources: plugin('docker'), destinations: plugin('claude_code', { routine_id: 'trig_x' }) },
      default: { sources: plugin('theme_wagon'), destinations: plugin('pushover') },
    },
  });

  assertEquals(Object.keys(contexts).sort(), ['default', 'myapp']);
  assertEquals(contexts.myapp.sources, plugin('docker'));
});

Deno.test('mixing contexts with top-level sources or destinations is rejected', () => {
  assertThrows(
    () => toContexts({ contexts: { myapp: { sources: {}, destinations: {} } }, sources: plugin('github') }),
    Error,
    'both `contexts` and top-level',
  );

  assertThrows(
    () => toContexts({ contexts: { myapp: { sources: {}, destinations: {} } }, destinations: plugin('pushover') }),
    Error,
    'both `contexts` and top-level',
  );
});

Deno.test('top-level errors config lands in the default context', () => {
  const contexts = toContexts({
    sources: plugin('github'),
    destinations: plugin('pushover'),
    errors: { destinations: ['log_file'] },
  });

  assertEquals(contexts.default.errors, { destinations: ['log_file'] });
});
