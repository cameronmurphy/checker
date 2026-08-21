import checkSource from '../../../src/cli/check.ts';
import BaseSourcePlugin, { SourceConfigSchema } from '../../../src/plugins/source/base.ts';
import BaseDestinationPlugin, { DestinationConfigSchema } from '../../../src/plugins/destination/base.ts';
import { setup, tearDown } from '../../mocks.ts';
import { assertEquals } from '@std/assert';
import { FakeTime } from '@std/testing/time';

// A source whose read() completes only when the test says so, standing in for one stuck on a
// filesystem or a request that never answers.
class HeldSource extends BaseSourcePlugin {
  public reads = 0;
  public release: (value: string) => void = () => {};

  public override getSchema() {
    return SourceConfigSchema;
  }

  public override read(_item: string): Promise<string> {
    this.reads++;
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }

  public override updated(before: string, after: string): boolean {
    return before !== after;
  }

  public override message(_before: string, after: string, _item: string): string {
    return after;
  }
}

class AcceptingDestination extends BaseDestinationPlugin {
  public delivered: string[] = [];

  public override getSchema() {
    return DestinationConfigSchema;
  }

  public override notify(message: string): Promise<boolean> {
    this.delivered.push(message);
    return Promise.resolve(true);
  }
}

function held(): { source: HeldSource; destination: AcceptingDestination } {
  const source = new HeldSource();
  source.setConfig({ interval: 30, items: ['watched'] }).setAlias('held');

  const destination = new AcceptingDestination();
  destination.setConfig({}).setAlias('accepting');

  return { source, destination };
}

Deno.test({
  name: 'check skips a source whose previous check has not finished',
  sanitizeResources: false,
  fn: async () => {
    setup();

    try {
      const { source, destination } = held();

      const first = checkSource('test', source, [destination]);
      const second = checkSource('test', source, [destination]);

      // The second call resolved without reading: one check per source at a time.
      await second;
      assertEquals(source.reads, 1);

      source.release('a value');
      await first;
      assertEquals(destination.delivered, ['a value']);

      // With the first check finished the source's slot is free again.
      const third = checkSource('test', source, [destination]);
      assertEquals(source.reads, 2);
      source.release('another value');
      await third;
    } finally {
      tearDown();
    }
  },
});

Deno.test({
  name: 'check stops waiting on a source stuck past the deadline but keeps its slot taken',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setup();
    const time = new FakeTime();

    try {
      const { source, destination } = held();

      const stuck = checkSource('test', source, [destination]);
      await time.tickAsync(5 * 60 * 1000);

      // The caller gets its promise back, so a sweep or a reload queue moves on.
      await stuck;

      // The check itself is still running, so the source stays skipped rather than re-read.
      await checkSource('test', source, [destination]);
      assertEquals(source.reads, 1);
    } finally {
      time.restore();
      tearDown();
    }
  },
});
