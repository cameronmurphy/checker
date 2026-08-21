import SemverComparator from '../comparator/semver.ts';
import { RELEASES_API, SHA256SUMS_ASSET } from '../constants.ts';
import denoJson from '../../deno.json' with { type: 'json' };
import { describeError } from '../utils/format.ts';

/** What an update attempt did, so the socket can report it and the daemon can decide to restart. */
export type UpdateResult = { updated: boolean; message: string };

type Release = { tag_name: string; assets: { name: string; browser_download_url: string }[] };

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// SHA256SUMS is `<hash>  <name>` per line, as sha256sum writes it.
function expectedDigest(sums: string, asset: string): string | null {
  for (const line of sums.split('\n')) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === asset) return hash;
  }

  return null;
}

/**
 * Asks launchd to start this service again once this process is gone.
 *
 * KeepAlive is supposed to cover the restart, and mostly does, but macOS kills launchd's first
 * launch of a code signature it has not seen with OS_REASON_CODESIGNING and then drops the service
 * rather than retrying it, leaving the machine with no checker running and nothing that will start
 * one. A kickstart from outside the job brings it back whichever way the launch went, and does
 * nothing when launchd managed the restart itself.
 */
export function scheduleRestart(): void {
  // Set by launchd to the job's label, and only by launchd, so this is also what says the process
  // is a service at all rather than someone running checker in a terminal.
  const label = Deno.env.get('XPC_SERVICE_NAME');

  if (Deno.build.os !== 'darwin' || !label || label === '0') return;

  try {
    new Deno.Command('/bin/sh', {
      args: ['-c', `sleep 5; exec /bin/launchctl kickstart gui/$(/usr/bin/id -u)/${label}`],
      stdin: 'null',
      stdout: 'null',
      stderr: 'null',
    }).spawn().unref();
  } catch (error) {
    console.error(`Could not arrange a restart, so checker may need starting by hand: ${describeError(error)}`);
  }
}

/** Picks the Developer ID out of `security find-identity` output, if the keychain holds one. */
export function identityFrom(listing: string): string | null {
  return listing.match(/"(Developer ID Application: [^"]+)"/)?.[1] ?? null;
}

/**
 * Re-signs the new binary with the keychain's Developer ID, when there is one.
 *
 * macOS ties consent — access to removable volumes, most visibly — to the binary's code-signing
 * identity, and the ad-hoc signature deno compile leaves is a new identity every build. Each
 * release made the daemon a stranger again: reads of a watched volume sat blocked in the kernel
 * until someone clicked Allow on a prompt. A Developer ID signature is the same identity every
 * release, so consent given once holds. With no identity in the keychain nothing happens, and the
 * ad-hoc signature stays — that is the prompt-per-release status quo, not a failure.
 */
async function sign(path: string): Promise<void> {
  if (Deno.build.os !== 'darwin') return;

  const listing = await new Deno.Command('/usr/bin/security', {
    args: ['find-identity', '-v', '-p', 'codesigning'],
  }).output().catch(() => null);

  if (!listing?.success) return;

  const identity = identityFrom(new TextDecoder().decode(listing.stdout));

  if (!identity) return;

  const signed = await new Deno.Command('/usr/bin/codesign', {
    args: ['--force', '--sign', identity, path],
  }).output();

  if (signed.success) {
    console.log(`Signed as ${identity}`);
  } else {
    console.error(
      `Signing as ${identity} failed, keeping the ad-hoc signature: ${new TextDecoder().decode(signed.stderr).trim()}`,
    );
  }
}

/**
 * Runs the new binary once, which has to happen before the daemon exits for its restart.
 *
 * macOS kills launchd's first launch of a code signature it has not seen with OS_REASON_CODESIGNING
 * and drops the service rather than retrying it, so a daemon that exits to be restarted never comes
 * back. An ordinary run takes that first launch somewhere it costs nothing and leaves launchd the
 * second one. It doubles as the only check that what was downloaded runs at all: the checksum says
 * the bytes arrived intact, not that they are a binary this machine can execute.
 */
export async function exercise(path: string): Promise<void> {
  let ran: Deno.CommandOutput;

  try {
    ran = await new Deno.Command(path, { args: ['--version'], stdout: 'null', stderr: 'piped' }).output();
  } catch (error) {
    throw new Error(`The downloaded binary would not run: ${error instanceof Error ? error.message : error}`);
  }

  if (!ran.success) {
    throw new Error(`The downloaded binary would not run: ${new TextDecoder().decode(ran.stderr).trim()}`);
  }
}

async function fetchAsset(release: Release, name: string): Promise<Uint8Array<ArrayBuffer>> {
  const asset = release.assets.find((candidate) => candidate.name === name);

  if (!asset) {
    throw new Error(`Release ${release.tag_name} has no asset called ${name}`);
  }

  const response = await fetch(asset.browser_download_url);

  if (!response.ok) {
    throw new Error(`Failed to download ${name}: ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Replaces the running binary with the newest release for this platform, leaving the previous one
 * beside it. Returns without touching anything when the release is not newer.
 *
 * The swap is a rename rather than a write, so the running process keeps the binary it started
 * from and stays intact until it exits.
 */
export default async function selfUpdate(): Promise<UpdateResult> {
  // Run from source, Deno.execPath() is the deno binary, and replacing that is not the ask.
  if (!Deno.build.standalone) {
    throw new Error('This checker is running from source, so there is no released binary of its own to replace');
  }

  const response = await fetch(RELEASES_API, { headers: { accept: 'application/vnd.github+json' } });

  if (!response.ok) {
    throw new Error(`Failed to check for a release: ${response.statusText}`);
  }

  const release: Release = await response.json();
  const latest = release.tag_name.replace(/^v/, '');
  const current = denoJson.version;

  if (!new SemverComparator().updated(current, latest)) {
    return { updated: false, message: `Already on the newest release (v${current})` };
  }

  const asset = `checker-${Deno.build.target}`;
  const sums = new TextDecoder().decode(await fetchAsset(release, SHA256SUMS_ASSET));
  const expected = expectedDigest(sums, asset);

  if (!expected) {
    throw new Error(`${SHA256SUMS_ASSET} does not cover ${asset}`);
  }

  const binary = await fetchAsset(release, asset);
  const actual = await digest(binary);

  if (actual !== expected) {
    throw new Error(`${asset} does not match its checksum, refusing to install it`);
  }

  // Staged beside the binary so the rename stays on one filesystem, which is what makes it atomic.
  const path = Deno.execPath();
  const staged = `${path}.staged`;

  await Deno.writeFile(staged, binary, { mode: 0o755 });

  try {
    await Deno.copyFile(path, `${path}.previous`);
    await Deno.rename(staged, path);
  } catch (error) {
    await Deno.remove(staged).catch(() => {});
    throw error;
  }

  await sign(path);

  // A binary that will not start is worse than no update, since the daemon exits expecting one.
  // Putting the old one back leaves something that runs, and the next check tries the update again.
  try {
    await exercise(path);
  } catch (error) {
    await Deno.rename(`${path}.previous`, path).catch(() => {});
    throw error;
  }

  return { updated: true, message: `Updated v${current} to v${latest}` };
}
