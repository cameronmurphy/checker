/**
 * Comparator for values that only matter when the number grows.
 *
 * @module
 */

import BaseComparator from './base.ts';

/**
 * Reports an update only when the value parses to a larger integer than before.
 */
export default class IntComparator extends BaseComparator {
  /**
   * True when `after` is a larger integer than `before`.
   */
  updated(before: string, after: string): boolean {
    return parseInt(after) > parseInt(before);
  }
}
