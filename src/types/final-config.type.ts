export type PluginsConfigType = Record<string, object>;

export type ContextConfigType = {
  sources: PluginsConfigType;
  destinations: PluginsConfigType;
};

type FinalConfigType = {
  sources?: PluginsConfigType;
  destinations?: PluginsConfigType;
  contexts?: Record<string, ContextConfigType>;
};

export default FinalConfigType;
