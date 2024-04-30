import BaseComparator from './base.ts';

export default class StrlenComparator extends BaseComparator {
  updated(before: string, after: string): boolean {
    return after.length > before.length;
  }
}
