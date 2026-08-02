/**
 * Comparator that treats any change in text as an update, ignoring case.
 *
 * @module
 */

import BaseComparator from './base.ts';

/**
 * Reports a change in text as an update, ignoring case. Suits scraped content where only the
 * wording carries meaning.
 */
export default class CaseInsensitiveComparator extends BaseComparator {
  /**
   * True when the text differs other than in case.
   */
  updated(before: string, after: string): boolean {
    if (!after) return false;
    if (!before) return true;

    return before.toLowerCase() !== after.toLowerCase();
  }
}
