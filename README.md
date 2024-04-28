# Checker

[![Lint and test](https://github.com/cameronmurphy/checker/actions/workflows/lint-and-test.yml/badge.svg)](https://github.com/cameronmurphy/checker/actions/workflows/lint-and-test.yml)

Get notified when stuff changes.

## Dev setup (macOS)

Install [Homebrew](https://brew.sh).

```shell
brew bundle
```

[Configure your shell](https://asdf-vm.com/guide/getting-started.html#_3-install-asdf) for asdf. Restart your terminal
session.

```shell
asdf plugin install deno
asdf install
```

## Configuration

Copy the example config to the default location and customise as necessary.

```shell
mkdir -p ~/.config/checker
cp config.example.yml ~/.config/checker/config.yml
vim ~/.config/checker/config.yml # Set up at least one source and destination
```

## Writing a plugin

### Sources

Source plugins by default go in `~/.config/checker/plugins/source`. Here's an example of a plugin that checks whether
Taylor is playing in Australia any time soon.

```typescript
import BaseSourcePlugin, {
  zod as z,
} from 'https://raw.githubusercontent.com/cameronmurphy/checker/main/src/plugins/source/base.ts';

export default class TaylorSource extends BaseSourcePlugin {
  private static ConfigSchema = BaseSourcePlugin.ConfigSchema.extend({
    items: z.array(z.string()).nonempty('Please specify at least one city'),
  });

  public getSchema() {
    return TaylorSource.ConfigSchema;
  }

  public async read(item?: string) {
  }

  public updated(_before: string, _after: string) {
    return false;
  }

  public message(_before: string, _after: string) {
    return '';
  }
}
```

## Scripts

### Dev

Run the app and automatically reload when the code changes.

```shell
deno task dev
```

### Run

Run the app.

```shell
deno task run
```

Run the app against a different config file.

```shell
deno task run --config-file /usr/local/etc/checker/config.yml
```

### Upgrade deps

To upgrade all dependencies:

```shell
deno task upgrade-deps
```
