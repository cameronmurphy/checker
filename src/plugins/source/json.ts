import BaseSourcePlugin, { SourceConfigSchema } from './base.ts';
import type BaseComparator from '../../comparator/base.ts';
import CaseInsensitiveComparator from '../../comparator/case-insensitive.ts';
import IntComparator from '../../comparator/int.ts';
import SemverComparator from '../../comparator/semver.ts';
import { urlLabel } from '../../utils/format.ts';
import { z } from 'zod';

// The resolved value becomes the stored value, so a path pointing at half the document would put
// half the document in state. Narrowing the path is the answer; hashing a whole one is 'page'.
const MAX_LENGTH = 1024;

const COMPARATORS: Record<string, BaseComparator> = {
  case_insensitive: new CaseInsensitiveComparator(),
  int: new IntComparator(),
  semver: new SemverComparator(),
};

const JsonConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.url('JSON plugin items must be URLs')).min(1, 'JSON plugin requires at least one URL'),
  comparator: z.enum(['case_insensitive', 'int', 'semver']).default('case_insensitive'),
});

type JsonConfig = z.infer<typeof JsonConfigSchema>;

// RFC 6901, so a key containing a slash is written ~1 and one containing a tilde ~0. The leading
// slash is optional here, since '#iss_position' is the obvious way to write a top-level key.
function resolve(document: unknown, pointer: string): unknown {
  if (!pointer) return document;

  let value = document;

  for (const token of pointer.replace(/^\//, '').split('/')) {
    const key = decodeURIComponent(token).replaceAll('~1', '/').replaceAll('~0', '~');

    if (Array.isArray(value)) {
      value = value[Number(key)];
    } else if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }

    if (value === undefined) return undefined;
  }

  return value;
}

// Keys are sorted so that a document rebuilt in a different order isn't reported as a change.
function stringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${
      Object.entries(value as Record<string, unknown>)
        .sort(([one], [other]) => one.localeCompare(other))
        .map(([key, nested]) => `${JSON.stringify(key)}:${stringify(nested)}`)
        .join(',')
    }}`;
  }

  return JSON.stringify(value) ?? '';
}

// A string the pointer lands on is stored as it reads, so a version is 'v1.2.3' rather than
// '"v1.2.3"' and a destination can act on it. Anything else keeps its JSON punctuation.
function serialise(value: unknown): string {
  return typeof value === 'string' ? value : stringify(value);
}

function itemLabel(item: string): string {
  const { hash } = new URL(item);
  return `${urlLabel(item)}${hash}`;
}

export class JsonSource extends BaseSourcePlugin<JsonConfig> {
  public override getSchema() {
    return JsonConfigSchema;
  }

  public override async read(item: string): Promise<string> {
    const url = new URL(item);
    const pointer = url.hash.slice(1);
    url.hash = '';

    const response = await fetch(url, { headers: { accept: 'application/json' } });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.statusText}`);
      return '';
    }

    let document: unknown;

    try {
      document = await response.json();
    } catch {
      console.error(`${url} did not answer with JSON`);
      return '';
    }

    const value = resolve(document, pointer);

    if (value === undefined) {
      console.error(`${url} has nothing at ${pointer || '/'}`);
      return '';
    }

    const serialised = serialise(value);

    if (serialised.length > MAX_LENGTH) {
      console.error(
        `${itemLabel(item)} is ${serialised.length} characters; point the path at something smaller, ` +
          'or use the page plugin, which hashes the whole document instead',
      );
      return '';
    }

    return serialised;
  }

  public override updated(before: string, after: string): boolean {
    return COMPARATORS[this.getConfig().comparator].updated(before, after);
  }

  public override message(before: string, after: string, item: string): string {
    if (!before) {
      return `${itemLabel(item)}: first seen value is ${after}`;
    }

    return `${itemLabel(item)}: ${after} (was ${before})`;
  }
}
