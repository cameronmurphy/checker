/**
 * Comparator for values that only matter when the text gets longer.
 *
 * @module
 */

import BaseComparator from './base.ts';

/**
 * Reports an update only when the text is longer than before, for pages that grow by appending.
 */
export default class StrlenComparator extends BaseComparator {
  /**
   * True when `after` is longer than `before`.
   */
  updated(before: string, after: string): boolean {
    return after.length > before.length;
  }
}
