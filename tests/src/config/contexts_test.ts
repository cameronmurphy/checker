import { toContexts } from '../../../src/config/schema.ts';
import { assertEquals, assertThrows } from '@std/assert';

Deno.test('a config without contexts becomes a single default context', () => {
  const contexts = toContexts({
    sources: { github: { items: ['vercel/next.js'] } },
    destinations: { pushover: { token: 'abcd' } },
  });

  assertEquals(Object.keys(contexts), ['default']);
  assertEquals(contexts.default.sources, { github: { items: ['vercel/next.js'] } });
  assertEquals(contexts.default.destinations, { pushover: { token: 'abcd' } });
});

Deno.test('a config with only sources still yields a usable default context', () => {
  const contexts = toContexts({ sources: { github: {} } });

  assertEquals(contexts.default.sources, { github: {} });
  assertEquals(contexts.default.destinations, {});
});

Deno.test('naming the default context explicitly is equivalent to omitting contexts', () => {
  const implicit = toContexts({
    sources: { github: { items: ['a/b'] } },
    destinations: { pushover: { token: 'x' } },
  });
  const explicit = toContexts({
    contexts: {
      default: {
        sources: { github: { items: ['a/b'] } },
        destinations: { pushover: { token: 'x' } },
      },
    },
  });

  assertEquals(explicit, implicit);
});

Deno.test('contexts are passed through untouched', () => {
  const contexts = toContexts({
    contexts: {
      myapp: { sources: { docker: {} }, destinations: { claude_code: { routine_id: 'trig_x' } } },
      default: { sources: { theme_wagon: {} }, destinations: { pushover: {} } },
    },
  });

  assertEquals(Object.keys(contexts).sort(), ['default', 'myapp']);
  assertEquals(contexts.myapp.sources, { docker: {} });
});

Deno.test('mixing contexts with top-level sources or destinations is rejected', () => {
  assertThrows(
    () => toContexts({ contexts: { myapp: { sources: {}, destinations: {} } }, sources: { github: {} } }),
    Error,
    'both `contexts` and top-level',
  );

  assertThrows(
    () => toContexts({ contexts: { myapp: { sources: {}, destinations: {} } }, destinations: { pushover: {} } }),
    Error,
    'both `contexts` and top-level',
  );
});
