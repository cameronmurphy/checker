import BaseComparator from './base.ts';

export default class IntComparator extends BaseComparator {
  updated(before: string, after: string): boolean {
    return parseInt(after) > parseInt(before);
  }
}
