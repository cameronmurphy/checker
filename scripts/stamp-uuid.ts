import config from '../deno.json' with { type: 'json' };

const MH_MAGIC_64 = 0xfeedfacf;
const LC_UUID = 0x1b;
const HEADER_SIZE = 32;

export async function uuidFor(name: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(name));
  const uuid = new Uint8Array(digest).slice(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x50;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  return uuid;
}

export function formatUuid(uuid: Uint8Array): string {
  const hex = Array.from(uuid, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stampUuid(binary: Uint8Array, uuid: Uint8Array): void {
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  if (binary.byteLength < HEADER_SIZE || view.getUint32(0, true) !== MH_MAGIC_64) {
    throw new Error('not a thin 64-bit Mach-O');
  }

  const ncmds = view.getUint32(16, true);
  let offset = HEADER_SIZE;
  for (let i = 0; i < ncmds; i++) {
    const cmd = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    if (size < 8 || offset + size > binary.byteLength) throw new Error(`load command ${i} is malformed`);
    if (cmd === LC_UUID) {
      binary.set(uuid, offset + 8);
      return;
    }
    offset += size;
  }
  throw new Error('no LC_UUID load command');
}

if (import.meta.main) {
  const [path] = Deno.args;
  if (!path) {
    console.error('usage: stamp-uuid.ts <binary>');
    Deno.exit(2);
  }
  const binary = await Deno.readFile(path);
  const uuid = await uuidFor(config.name);
  stampUuid(binary, uuid);
  await Deno.writeFile(path, binary);
  console.log(`${path}: LC_UUID ${formatUuid(uuid)}`);
}
