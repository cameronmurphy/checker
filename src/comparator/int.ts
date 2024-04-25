import BaseComparator from './base.ts';

export default class IntComparator extends BaseComparator {
  updated(a: string, b: string): boolean {
    return parseInt(a) > parseInt(b);
  }
}
