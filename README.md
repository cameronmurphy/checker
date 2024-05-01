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

Source plugins by default go in `~/.config/checker/plugins/source`. Here's an example, `sheeran.ts`, which is a plugin
that checks whether Ed Sheeran is playing in certain countries any time soon.

```typescript
import BaseSourcePlugin, {
  zod as z,
} from 'https://raw.githubusercontent.com/cameronmurphy/checker/main/src/plugins/source/base.ts';
import StrlenComparator from 'https://raw.githubusercontent.com/cameronmurphy/checker/main/src/comparator/strlen.ts';
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';

export default class SheeranSource extends BaseSourcePlugin {
  private static ConfigSchema = BaseSourcePlugin.ConfigSchema.extend({
    items: z.array(z.string()).min(1, 'Sheeran plugin requires at least one country name'),
  });

  public getSchema() {
    return SheeranSource.ConfigSchema;
  }

  public async read(item?: string) {
    const response = await fetch('https://www.edsheeran.com/#tour');
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');

    const dates = Array.from(doc.querySelectorAll('.event_location')).filter((el) => el.textContent?.includes(item));
    return dates.map((el) => el.parentElement.querySelector('.event_date').textContent?.trim()).join(', ');
  }

  public updated(before: string, after: string) {
    return new StrlenComparator().updated(before, after);
  }

  public message(_before: string, after: string, item?: string) {
    return `Ed Sheeran is playing in ${item} on ${after}!`;
  }
}
```

Then you would configure this plugin like so:

```yaml
config:
  sources:
    sheeran:
      items:
        - 'Australia'
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
