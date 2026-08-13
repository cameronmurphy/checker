import SemverComparator from '../comparator/semver.ts';
import { RELEASES_API, SHA256SUMS_ASSET } from '../constants.ts';
import denoJson from '../../deno.json' with { type: 'json' };

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

  return { updated: true, message: `Updated v${current} to v${latest}` };
}
