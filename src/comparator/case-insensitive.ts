import BaseComparator from './base.ts';

export default class CaseInsensitiveComparator extends BaseComparator {
  updated(before: string, after: string): boolean {
    if (!after) return false;
    if (!before) return true;

    return before.toLowerCase() !== after.toLowerCase();
  }
}
