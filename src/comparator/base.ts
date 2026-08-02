/**
 * Comparators decide whether a value a source just read counts as an update.
 *
 * @module
 */

/**
 * The contract every comparator implements. A source holds one and delegates its `updated()`
 * to it, so the same "did this change" rule can be shared across plugins.
 */
export default abstract class BaseComparator {
  /**
   * Whether `after` should be treated as an update to `before`. `before` is an empty string the
   * first time an item is seen.
   */
  abstract updated(before: string, after: string): boolean;
}
