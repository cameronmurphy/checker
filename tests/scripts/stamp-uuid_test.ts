import { assertEquals, assertNotEquals, assertThrows } from '@std/assert';
import { formatUuid, stampUuid, uuidFor } from '../../scripts/stamp-uuid.ts';

const machO = (): Uint8Array => {
  const bytes = new Uint8Array(32 + 72 + 24);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(16, 2, true);
  view.setUint32(32, 0x19, true);
  view.setUint32(36, 72, true);
  view.setUint32(104, 0x1b, true);
  view.setUint32(108, 24, true);
  bytes.fill(0xaa, 112);
  return bytes;
};

Deno.test('stampUuid overwrites only the LC_UUID bytes', async () => {
  const bytes = machO();
  const uuid = await uuidFor('@camurphy/checker');
  stampUuid(bytes, uuid);

  assertEquals(bytes.slice(112), uuid);
  assertEquals(bytes.slice(0, 112), machO().slice(0, 112));
});

Deno.test('stampUuid refuses what is not a 64-bit Mach-O', () => {
  assertThrows(() => stampUuid(new Uint8Array(64), new Uint8Array(16)), Error, 'not a thin 64-bit Mach-O');
});

Deno.test('stampUuid refuses a Mach-O without LC_UUID', () => {
  const bytes = machO();
  new DataView(bytes.buffer).setUint32(16, 1, true);
  assertThrows(() => stampUuid(bytes, new Uint8Array(16)), Error, 'no LC_UUID');
});

Deno.test('stampUuid refuses a load command that runs off the end', () => {
  const bytes = machO();
  new DataView(bytes.buffer).setUint32(36, 4096, true);
  assertThrows(() => stampUuid(bytes, new Uint8Array(16)), Error, 'malformed');
});

Deno.test('uuidFor is stable per name and distinct between names', async () => {
  const a = await uuidFor('@camurphy/checker');
  assertEquals(a, await uuidFor('@camurphy/checker'));
  assertNotEquals(a, await uuidFor('@camurphy/weight-loss-bot'));
  assertEquals(a[6] >> 4, 5);
  assertEquals(a[8] >> 6, 2);
});

Deno.test('formatUuid matches how dwarfdump prints it', () => {
  const uuid = Uint8Array.from([
    0x4c,
    0x4c,
    0x44,
    0x14,
    0x55,
    0x55,
    0x31,
    0x44,
    0xa1,
    0xdd,
    0x73,
    0xd0,
    0x70,
    0x04,
    0xc5,
    0xfb,
  ]);
  assertEquals(formatUuid(uuid), '4C4C4414-5555-3144-A1DD-73D07004C5FB');
});
