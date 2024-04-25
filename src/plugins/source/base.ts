abstract class BaseSourcePlugin {
  protected config: object;

  constructor(config: object) {
    this.config = config;
  }

  // Read the state of play for a given item
  abstract async read(item: string): string;

  // Is b new/better enough to notify a subscriber about?
  abstract updated(a: string, b: string): boolean;

  // Given there's a change, from a to b, what should we tell the subscriber?
  abstract message(a: string, b: string): string;
}

export default BaseSourcePlugin;
