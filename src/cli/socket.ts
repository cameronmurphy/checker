import { dirname, join } from '@std/path';
import { expand } from '../utils/path.ts';
import { describeError } from '../utils/format.ts';
import { SOCKET_FILE_NAME } from '../constants.ts';

/** What the daemon sends back for a command, one JSON line. */
export type Reply = { ok: boolean; message: string; exit?: boolean };

/** Nothing is listening, which a caller may be able to handle itself rather than give up on. */
export class NoDaemonError extends Error {}

// sockaddr_un caps the path at 104 bytes on macOS and 108 on Linux, and binding a longer one fails
// with "path must be shorter than SUN_LEN". Well under both, since the cap counts bytes.
const MAX_SOCKET_PATH = 90;

// Enough to keep two configs apart, which is all this names. Not a checksum.
function fingerprint(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function socketPath(configFile: string): string {
  const beside = join(dirname(expand(configFile)), SOCKET_FILE_NAME);

  if (new TextEncoder().encode(beside).length <= MAX_SOCKET_PATH) return beside;

  // A config nested too deep to hold a socket still gets its own, named after where it lives.
  return join('/tmp', `checker-${fingerprint(beside)}.sock`);
}

/**
 * Whether something is already listening. An unclean shutdown leaves the socket file behind, and a
 * stale one refuses connections, which is what separates it from a live daemon.
 */
async function inUse(path: string): Promise<boolean> {
  try {
    const connection = await Deno.connect({ transport: 'unix', path });
    connection.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Serves commands to the `checker` CLI. Returns null when another daemon holds the socket, which
 * leaves that one in charge rather than taking its socket away.
 */
export async function listen(
  configFile: string,
  handle: (command: string) => Promise<Reply>,
): Promise<Deno.UnixListener | null> {
  const path = socketPath(configFile);

  if (await inUse(path)) {
    console.error(`Not serving commands: ${path} is already in use by another checker`);
    return null;
  }

  await Deno.remove(path).catch(() => {});

  let listener: Deno.UnixListener;

  try {
    listener = Deno.listen({ transport: 'unix', path });
  } catch (error) {
    console.error(`Not serving commands on ${path}: ${describeError(error)}`);
    return null;
  }

  (async () => {
    for await (const connection of listener) {
      try {
        const buffer = new Uint8Array(1024);
        const read = await connection.read(buffer);
        const command = new TextDecoder().decode(buffer.subarray(0, read ?? 0)).trim();

        // A connection that closes without sending anything is another daemon checking whether this
        // socket is live. Replying to it only earns a broken pipe.
        if (!command) {
          connection.close();
          continue;
        }

        const reply: Reply = await handle(command).catch((error) => ({
          ok: false,
          message: describeError(error),
        }));

        // Written before any exit the command asks for, or the CLI would see the socket close with
        // nothing on it and couldn't tell success from a crash.
        await connection.write(new TextEncoder().encode(`${JSON.stringify(reply)}\n`));
        connection.close();

        if (reply.exit) {
          listener.close();
          await Deno.remove(path).catch(() => {});
          console.log('Restarting to finish the update');
          Deno.exit(0);
        }
      } catch (error) {
        console.error(`Command failed: ${describeError(error)}`);
        try {
          connection.close();
        } catch { /* already gone */ }
      }
    }
  })().catch((error) => console.error(`Stopped serving commands: ${describeError(error)}`));

  return listener;
}

/** Sends one command from the CLI to a running daemon. */
export async function send(configFile: string, command: string): Promise<Reply> {
  const path = socketPath(configFile);

  let connection: Deno.UnixConn;

  try {
    connection = await Deno.connect({ transport: 'unix', path });
  } catch {
    throw new NoDaemonError(`No checker is running on ${path}`);
  }

  try {
    await connection.write(new TextEncoder().encode(command));

    const buffer = new Uint8Array(4096);
    const read = await connection.read(buffer);
    const body = new TextDecoder().decode(buffer.subarray(0, read ?? 0)).trim();

    if (!body) {
      throw new Error('The daemon closed the connection without replying');
    }

    return JSON.parse(body) as Reply;
  } finally {
    connection.close();
  }
}
