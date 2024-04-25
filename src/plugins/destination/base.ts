// A source plugin is responsible for checking a source.
abstract class BaseDestinationPlugin {
  async notify(message: string): boolean;
}

export default BaseDestinationPlugin;
