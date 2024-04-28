import BaseComparator from './base.ts';

export default class IntComparator extends BaseComparator {
  static updated(before: string, after: string): boolean {
    return parseInt(after) > parseInt(before);
  }
}
