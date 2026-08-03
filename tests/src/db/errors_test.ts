import {
  captureErrors,
  listErrors,
  listUnownedErrors,
  recordError,
  resetErrors,
  runWithErrorContext,
  setOwnedErrorContexts,
  suppressErrorRecording,
} from '../../../src/db/errors.ts';
import * as mock from '@std/testing/mock';
import { assertEquals, assertStringIncludes } from '@std/assert';

Deno.test('recorded errors carry the context of the check that logged them', async () => {
  resetErrors();

  await runWithErrorContext('wrx', () => {
    recordError('wrx blew up');
    return Promise.resolve();
  });
  recordError('unattributed');

  assertEquals(listErrors('wrx').map((entry) => entry.text), ['wrx blew up']);
  assertEquals(listErrors().length, 2);
});

Deno.test('attribution holds when checks overlap', async () => {
  resetErrors();

  await Promise.all([
    runWithErrorContext('slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      recordError('failure in slow');
    }),
    runWithErrorContext('fast', () => {
      recordError('failure in fast');
      return Promise.resolve();
    }),
  ]);

  assertEquals(listErrors('slow').map((entry) => entry.text), ['failure in slow']);
  assertEquals(listErrors('fast').map((entry) => entry.text), ['failure in fast']);
});

Deno.test('unowned listing excludes contexts that report their own errors', async () => {
  resetErrors();
  setOwnedErrorContexts(['wrx']);

  await runWithErrorContext('wrx', () => {
    recordError('claimed failure');
    return Promise.resolve();
  });
  await runWithErrorContext('theme', () => {
    recordError('spare failure');
    return Promise.resolve();
  });
  recordError('unattributed failure');

  const texts = listUnownedErrors().map((entry) => entry.text);
  assertEquals(texts.includes('claimed failure'), false);
  assertEquals(texts.includes('spare failure'), true);
  assertEquals(texts.includes('unattributed failure'), true);
});

Deno.test('multi-line output is recorded as a single line', () => {
  resetErrors();

  recordError('Config reload failed: [\n  {\n    "code": "invalid_type"\n  }\n]');

  const [entry] = listErrors();
  assertEquals(entry.text.includes('\n'), false);
  assertStringIncludes(entry.text, 'invalid_type');
});

Deno.test('oversized output is truncated', () => {
  resetErrors();

  recordError('x'.repeat(2000));

  assertEquals(listErrors()[0].text.length, 500);
});

Deno.test('the buffer keeps only the most recent entries', () => {
  resetErrors();

  for (let i = 0; i < 60; i++) recordError(`failure ${i}`);

  const entries = listErrors();
  assertEquals(entries.length, 50);
  assertEquals(entries[0].text, 'failure 10');
  assertEquals(entries[49].text, 'failure 59');
});

Deno.test('suppressed recording keeps delivery failures out of the buffer', async () => {
  resetErrors();

  await suppressErrorRecording(() => {
    recordError('Destination log_file failed: permission denied');
    return Promise.resolve();
  });

  assertEquals(listErrors().length, 0);
});

Deno.test('captureErrors records what plugins log without changing their behaviour', () => {
  resetErrors();
  const logged: unknown[][] = [];
  const stub = mock.stub(console, 'error', (...args: unknown[]) => void logged.push(args));

  try {
    captureErrors();
    console.error('Failed to fetch the Node.js release index: Service Unavailable');
  } finally {
    stub.restore();
  }

  assertEquals(logged.length, 1);
  assertStringIncludes(listErrors()[0].text, 'Node.js release index');
});
