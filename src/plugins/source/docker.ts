import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import SemverComparator from '../../comparator/semver.ts';
import { greaterThan, type SemVer, tryParse } from '@std/semver';
import { z } from 'zod';

const DOCKER_HUB_REGISTRY = 'registry-1.docker.io';
const TAGS_PAGE_SIZE = 1000;
const MAX_TAG_PAGES = 20;
const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const DockerConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.string()).min(1, 'Docker plugin requires at least one image name'),
  prereleases: z.boolean().default(false),
  username: z.string().optional(),
  password: z.string().optional(),
});

type DockerConfig = z.infer<typeof DockerConfigSchema>;

type ImageRef = { registry: string; repository: string; tag: string | null };

function shortDigest(digest: string): string {
  const separator = digest.indexOf(':');
  return separator < 0 ? digest : digest.slice(0, separator + 13);
}

export class DockerSource extends BaseSourcePlugin<DockerConfig> {
  private readonly comparator = new SemverComparator();
  private readonly tokens = new Map<string, { token: string; expires: number }>();

  public override getSchema() {
    return DockerConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const ref = this.parseItem(item);

    return ref.tag ? await this.readDigest(ref) : await this.readLatestRelease(ref);
  }

  public override updated(before: string, after: string): boolean {
    return this.comparator.updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    if (this.parseItem(item).tag) {
      if (!before) {
        return `${item}: first seen digest is ${shortDigest(after)}`;
      }
      return `${item}: image rebuilt, digest is now ${shortDigest(after)} (was ${shortDigest(before)})`;
    }

    if (!before) {
      return `${item}: first seen release is ${after}`;
    }
    return `${item}: new release ${after} (was ${before})`;
  }

  private async readDigest(ref: ImageRef): Promise<string> {
    const url = `https://${ref.registry}/v2/${ref.repository}/manifests/${ref.tag}`;
    const response = await this.registryFetch(url, ref, { method: 'HEAD', accept: MANIFEST_ACCEPT });

    if (!response.ok) {
      console.error(`Failed to fetch manifest for ${ref.repository}:${ref.tag}: ${response.statusText}`);
      return '';
    }

    return response.headers.get('docker-content-digest') ?? '';
  }

  private async readLatestRelease(ref: ImageRef): Promise<string> {
    const { prereleases } = this.getConfig();
    let latest = '';
    let latestParsed: SemVer | null = null;

    for (const tag of await this.readTags(ref)) {
      const parsed = tryParse(tag);

      if (!parsed) continue;
      if (!prereleases && parsed.prerelease?.length) continue;
      if (latestParsed && !greaterThan(parsed, latestParsed)) continue;

      latest = tag;
      latestParsed = parsed;
    }

    return latest;
  }

  private async readTags(ref: ImageRef): Promise<string[]> {
    const tags: string[] = [];
    let path = `/v2/${ref.repository}/tags/list?n=${TAGS_PAGE_SIZE}`;

    for (let page = 0; page < MAX_TAG_PAGES; page++) {
      const url = new URL(path, `https://${ref.registry}`).toString();
      const response = await this.registryFetch(url, ref, {});

      if (!response.ok) {
        await response.body?.cancel();
        console.error(`Failed to list tags for ${ref.repository}: ${response.statusText}`);
        return tags;
      }

      const body = await response.json();
      tags.push(...(body.tags ?? []));

      const next = response.headers.get('link')?.match(/<([^>]+)>\s*;\s*rel="?next"?/)?.[1];
      if (!next) return tags;

      path = next;
    }

    console.error(`Tag list for ${ref.repository} truncated after ${MAX_TAG_PAGES} pages`);
    return tags;
  }

  private async registryFetch(
    url: string,
    ref: ImageRef,
    { method = 'GET', accept }: { method?: string; accept?: string },
  ): Promise<Response> {
    const headers: Record<string, string> = accept ? { Accept: accept } : {};
    const cached = this.tokens.get(this.tokenKey(ref));

    if (cached && cached.expires > Date.now()) {
      headers.Authorization = `Bearer ${cached.token}`;
    }

    const response = await fetch(url, { method, headers });
    const challenge = response.status === 401 ? response.headers.get('www-authenticate') : null;

    if (!challenge) return response;

    await response.body?.cancel();
    headers.Authorization = `Bearer ${await this.fetchToken(challenge, ref)}`;

    return await fetch(url, { method, headers });
  }

  private async fetchToken(challenge: string, ref: ImageRef): Promise<string> {
    const params = Object.fromEntries(
      [...challenge.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
    );

    if (!params.realm) {
      throw new Error(`Registry ${ref.registry} sent an unusable auth challenge: ${challenge}`);
    }

    const url = new URL(params.realm);
    if (params.service) url.searchParams.set('service', params.service);
    url.searchParams.set('scope', params.scope ?? `repository:${ref.repository}:pull`);

    const { username, password } = this.getConfig();
    const response = await fetch(url, {
      headers: username && password ? { Authorization: `Basic ${btoa(`${username}:${password}`)}` } : {},
    });

    if (!response.ok) {
      throw new Error(`Failed to authenticate with ${ref.registry}: ${response.statusText}`);
    }

    const body = await response.json();
    const token = body.token ?? body.access_token;

    if (!token) {
      throw new Error(`Registry ${ref.registry} returned no pull token for ${ref.repository}`);
    }

    this.tokens.set(this.tokenKey(ref), {
      token,
      expires: Date.now() + Math.max((body.expires_in ?? 60) - 10, 5) * 1000,
    });

    return token;
  }

  private tokenKey(ref: ImageRef): string {
    return `${ref.registry}/${ref.repository}`;
  }

  // An item with a tag ('nginx:latest') tracks that tag's digest, so a rebuild notifies; without one
  // ('nginx') the highest semver tag is tracked instead, so only new releases notify.
  private parseItem(item: string): ImageRef {
    const separator = item.lastIndexOf(':');
    const hasTag = separator > item.lastIndexOf('/');
    const name = hasTag ? item.slice(0, separator) : item;
    const tag = hasTag ? item.slice(separator + 1) : null;
    const [host, ...rest] = name.split('/');

    // Docker's own rule: a first path component that looks like a host is one, everything else is on
    // Docker Hub, where single-word names are implicitly under 'library'.
    if (rest.length > 0 && (host.includes('.') || host.includes(':') || host === 'localhost')) {
      return { registry: host, repository: rest.join('/'), tag };
    }

    return { registry: DOCKER_HUB_REGISTRY, repository: name.includes('/') ? name : `library/${name}`, tag };
  }
}
