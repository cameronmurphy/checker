# Checker

[![Lint and test](https://github.com/cameronmurphy/checker/actions/workflows/lint-and-test.yml/badge.svg)](https://github.com/cameronmurphy/checker/actions/workflows/lint-and-test.yml)

Get notified when stuff changes.

## Dev setup (macOS)

Install [Homebrew](https://brew.sh).

```shell
brew bundle
```

Ensure `mise activate` is [in your shell rc/profile](https://mise.jdx.dev/cli/activate.html). If it needed to be added,
restart your terminal session.

```shell
mise trust
mise install
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
import BaseSourcePlugin, { SourceConfigSchema } from 'jsr:@camurphy/checker@0.0.1/plugins/source';
import CaseInsensitiveComparator from 'jsr:@camurphy/checker@0.0.1/comparator/case-insensitive';
import { z } from 'jsr:@zod/zod@^4.4.3';
import { DOMParser } from 'jsr:@b-fuze/deno-dom@^0.1.56';

const SheeranConfigSchema = SourceConfigSchema.extend({
  items: z.array(z.string()).min(1, 'Sheeran plugin requires at least one country name'),
});

type SheeranConfig = z.infer<typeof SheeranConfigSchema>;

export default class SheeranSource extends BaseSourcePlugin<SheeranConfig> {
  private readonly comparator = new CaseInsensitiveComparator();

  public override getSchema() {
    return SheeranConfigSchema;
  }

  public override async read(item: string) {
    const response = await fetch('https://www.edsheeran.com/');
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');

    const locations = Array.from(doc?.querySelectorAll('.event_location') || []);
    const relevantLocations = locations.filter((el) => el.textContent?.includes(item));
    const dates = relevantLocations.map((el) =>
      el.parentElement?.querySelector('.event_date')?.textContent?.replace(/\s+/g, ' ').trim()
    );
    return dates.filter(Boolean).join(', ');
  }

  public override updated(before: string, after: string) {
    return this.comparator.updated(before, after);
  }

  public override message(_before: string, after: string, item: string) {
    return `Ed Sheeran is playing in ${item} on ${after}!`;
  }
}
```

The class name determines the config key: `SheeranSource` has its `Source` suffix stripped and the rest snake-cased,
giving `sheeran`.

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

To check for outdated dependencies:

```shell
deno outdated
```

To update:

```shell
deno outdated --update
```

## Running as a service (macOS)

Checker polls on its own schedule, so it wants to stay resident rather than be re-launched on a timer.

Install the launch agent, substituting your home directory and this checkout for the placeholders. Run it from the
repository root so `$PWD` resolves correctly.

```shell
mkdir -p ~/Library/LaunchAgents
sed -e "s|__HOME__|$HOME|g" -e "s|__CHECKER__|$PWD|g" contrib/launchd/com.camurphy.checker.plist \
  > ~/Library/LaunchAgents/com.camurphy.checker.plist

launchctl load ~/Library/LaunchAgents/com.camurphy.checker.plist
```

The agent invokes deno through its mise shim rather than a bare `deno`, so it does not depend on `mise activate` having
run — it will not have, in launchd's very minimal environment.

Check that it came up, and watch the log:

```shell
launchctl list | grep checker
tail -f ~/Library/Logs/checker.log
```

To stop it, or to reload after pulling new code:

```shell
launchctl unload ~/Library/LaunchAgents/com.camurphy.checker.plist
```
