export default abstract class BasePlugin<TConfig extends object = object> {
  protected config: TConfig | null = null;

  public setConfig(config: TConfig): this {
    this.config = config;

    return this;
  }

  public getConfig(): TConfig {
    if (!this.config) {
      throw new Error(`Plugin ${this.getName()} has not been configured`);
    }
    return this.config;
  }

  public getName(): string {
    const className = this.constructor.name;

    if (!className.endsWith('Destination') && !className.endsWith('Source')) {
      throw new Error("Plugin class name should end with 'Destination' or 'Source'");
    }

    const strippedName = className.replace(/(Destination|Source)$/, '');
    return strippedName.split(/(?=[A-Z])/).join('_').toLowerCase();
  }
}
