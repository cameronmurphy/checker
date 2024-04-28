export default abstract class BaseComparator {
  abstract updated(before: string, after: string): boolean;
}
