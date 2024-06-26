export default abstract class BasePlugin {
  protected config: object | null = null;

  public setConfig(config: object) {
    this.config = config;

    return this;
  }

  public getName() {
    const className = this.constructor.name;

    if (!className.endsWith('Destination') && !className.endsWith('Source')) {
      throw new Error("Plugin class name should end with 'Destination' or 'Source'");
    }

    const strippedName = className.replace(/(Destination|Source)$/, '');
    return strippedName.split(/(?=[A-Z])/).join('_').toLowerCase();
  }
}
