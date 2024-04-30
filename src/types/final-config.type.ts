export type PluginsConfigType = Record<string, object>;

type FinalConfigType = {
  sources: PluginsConfigType;
  destinations: PluginsConfigType;
};

export default FinalConfigType;
