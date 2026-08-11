export const DEFAULT_CONFIG_FILE_PATH = '~/.config/checker/config.yml';
export const DEFAULT_CONTEXT = 'default';
export const DEFAULT_SOURCE_PLUGIN_DIR = '~/.config/checker/plugins/source';
export const DEFAULT_DESTINATION_PLUGIN_DIR = '~/.config/checker/plugins/destination';
export const ORPHAN_RETENTION_MS = 48 * 60 * 60 * 1000;
export const RELEASES_API = 'https://api.github.com/repos/cameronmurphy/checker/releases/latest';
export const SHA256SUMS_ASSET = 'SHA256SUMS';
// Beside the config rather than at a fixed path, so a second daemon on its own config gets its own
// socket instead of talking to the first one.
export const SOCKET_FILE_NAME = 'checker.sock';
