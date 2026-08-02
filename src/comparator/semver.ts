/**
 * Comparator for version strings.
 *
 * @module
 */

import BaseComparator from './base.ts';
import { greaterThan, tryParse } from '@std/semver';

/**
 * Reports an update only when the version increases. Tags that are not semver ("nightly",
 * calver, "release-1.2.3") fall back to a plain inequality so they still notify.
 */
export default class SemverComparator extends BaseComparator {
  /**
   * True when `after` is a higher version than `before`, or differs when either is not semver.
   */
  updated(before: string, after: string): boolean {
    if (!after) return false;
    if (!before) return true;

    const parsedBefore = tryParse(before);
    const parsedAfter = tryParse(after);

    // Not every project tags semver (calver, 'nightly', 'release-1.2.3'). Fall back to a plain
    // comparison so those still notify rather than going permanently silent.
    if (!parsedBefore || !parsedAfter) return before !== after;

    return greaterThan(parsedAfter, parsedBefore);
  }
}
