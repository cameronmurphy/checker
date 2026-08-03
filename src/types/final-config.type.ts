export type PluginConfigType = {
  plugin: string;
  config: object;
};

export type PluginsConfigType = Record<string, PluginConfigType>;

export type ErrorsConfigType = {
  destinations?: string[];
};

export type ContextConfigType = {
  sources: PluginsConfigType;
  destinations: PluginsConfigType;
  errors?: ErrorsConfigType;
};

type FinalConfigType = {
  sources?: PluginsConfigType;
  destinations?: PluginsConfigType;
  errors?: ErrorsConfigType;
  contexts?: Record<string, ContextConfigType>;
};

export default FinalConfigType;
