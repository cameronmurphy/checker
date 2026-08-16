/**
 * Comparator for Debian package versions.
 *
 * @module
 */

import BaseComparator from './base.ts';

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isAlpha(char: string | undefined): boolean {
  return char !== undefined && ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z'));
}

// dpkg's ordering for one character: the end of the string and digits rank together at zero, letters
// by their code point, and everything else above them — except '~', which sorts below the lot, so
// '1.0~rc1' comes before '1.0'.
function order(char: string | undefined): number {
  if (char === undefined || isDigit(char)) return 0;
  if (isAlpha(char)) return char.charCodeAt(0);
  if (char === '~') return -1;

  return char.charCodeAt(0) + 256;
}

// A port of dpkg's verrevcmp: walk both strings in alternating runs, comparing the non-digit runs
// character by character under order() and the digit runs as numbers, so 8.3.6-0ubuntu0.24.04.9
// ranks below .10 rather than above it the way a string comparison would.
function compareParts(a: string, b: string): number {
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    let firstDiff = 0;

    while ((i < a.length && !isDigit(a[i])) || (j < b.length && !isDigit(b[j]))) {
      const diff = order(a[i]) - order(b[j]);

      if (diff !== 0) return diff;

      i++;
      j++;
    }

    while (a[i] === '0') i++;
    while (b[j] === '0') j++;

    while (isDigit(a[i]) && isDigit(b[j])) {
      if (firstDiff === 0) firstDiff = a.charCodeAt(i) - b.charCodeAt(j);

      i++;
      j++;
    }

    // Whichever run still has digits left is the longer number, and a longer number is a bigger one.
    if (isDigit(a[i])) return 1;
    if (isDigit(b[j])) return -1;
    if (firstDiff !== 0) return firstDiff;
  }

  return 0;
}

function parse(version: string): { epoch: number; upstream: string; revision: string } {
  const epochMatch = version.match(/^(\d+):(.*)$/);
  const epoch = epochMatch ? Number(epochMatch[1]) : 0;
  const rest = epochMatch ? epochMatch[2] : version;
  const separator = rest.lastIndexOf('-');

  if (separator < 0) {
    return { epoch, upstream: rest, revision: '' };
  }

  return { epoch, upstream: rest.slice(0, separator), revision: rest.slice(separator + 1) };
}

/**
 * Compares two Debian versions the way dpkg does, returning a negative number when `a` is the
 * older, a positive number when it's the newer, and zero when they're equivalent.
 */
export function compare(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);

  if (left.epoch !== right.epoch) return left.epoch - right.epoch;

  const upstream = compareParts(left.upstream, right.upstream);

  return upstream === 0 ? compareParts(left.revision, right.revision) : upstream;
}

/**
 * Reports an update only when the version increases under dpkg's rules, which cover the parts of a
 * Debian version semver has no idea about: the epoch, the packaging revision, and '~' sorting
 * before the release it leads up to. A distribution's security updates usually move the revision
 * alone, so comparing the upstream version would miss them entirely.
 */
export default class DebianComparator extends BaseComparator {
  /** True when `after` is a higher Debian version than `before`. */
  updated(before: string, after: string): boolean {
    if (!after) return false;
    if (!before) return true;

    return compare(after, before) > 0;
  }
}
