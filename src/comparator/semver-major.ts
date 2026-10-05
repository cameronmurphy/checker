/**
 * Comparator for version strings that only reports a new major.
 *
 * @module
 */

import BaseComparator from './base.ts';
import { tryParse } from '@std/semver';

/**
 * Reports an update only when the major version increases. Minors and patches are ignored, which is
 * what a watch on a dist-tag that moves on every release wants when only the next major matters.
 * Tags that are not semver have no major to compare, so they fall back to a plain inequality rather
 * than going permanently silent.
 */
export default class SemverMajorComparator extends BaseComparator {
  /** True when `after` is on a higher major than `before`, or differs when either is not semver. */
  updated(before: string, after: string): boolean {
    if (!after) return false;
    if (!before) return true;

    const parsedBefore = tryParse(before);
    const parsedAfter = tryParse(after);

    if (!parsedBefore || !parsedAfter) return before !== after;

    return parsedAfter.major > parsedBefore.major;
  }
}
