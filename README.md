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
mise install
```

## Configuration

Copy the example config to the default location and customise as necessary.

```shell
mkdir -p ~/.config/checker
cp config.example.yml ~/.config/checker/config.yml
vim ~/.config/checker/config.yml # Set up at least one source and destination
```

### Contexts

A context pairs the things you watch with where their updates go. Configs don't have to mention them: everything under
`sources` and `destinations` belongs to a context named `default`, which is all most setups need.

Reach for contexts when one group of sources should reach somewhere different from another — say a project's own
dependencies driving a Claude Code routine for that project, while general-interest sources only reach your phone:

```yaml
config:
  contexts:
    default:
      sources:
        sheeran:
          items: ['Australia']
      destinations:
        pushover: &pushover # An anchor, so other contexts can reuse these credentials
          token: 'your-pushover-token'
          user_key: 'your-user-key'
    myapp:
      sources:
        docker:
          items: ['nginx'] # The same plugin can watch different things in each context
      destinations:
        pushover: *pushover
        claude_code:
          routine_id: 'trig_01ABCDEFGHJKLMNOPQRSTUVW'
          token: 'sk-ant-oat01-...'
```

Use one shape or the other — a config with `contexts` alongside top-level `sources`/`destinations` is rejected.
`default` is only the name used when `contexts` is absent, so writing it out explicitly changes nothing, including the
state already on disk.

Each context keeps its own state, so two contexts watching the same thing notify independently. That also means **moving
a source between contexts re-reads its items as first seen**, and it will notify once more from its new context.

Within a context, a source notifies every destination unless it names a subset with `destinations`.

### Naming sources and destinations

Each key under `sources` and `destinations` names one of them, and by default that name is the plugin's. Add `plugin:`
to name it something else, which is what lets one plugin back several:

```yaml
config:
  sources:
    filepond: # A new stable release opens an upgrade PR
      plugin: npm
      items: ['filepond']
      destinations: [claude_code]
    filepond_beta: # A beta is just worth knowing about
      plugin: npm
      items: ['filepond@beta']
      destinations: [pushover]
  destinations:
    pushover:
      token: 'your-pushover-token'
      user_key: 'your-user-key'
    claude_code:
      routine_id: 'trig_01ABCDEFGHJKLMNOPQRSTUVW'
      token: 'sk-ant-oat01-...'
```

The name is what everything else refers to — a source's `destinations` list, and the `errors` block below — and
referring to one that isn't configured is rejected rather than quietly notifying nobody. A source's state is stored
under its name too, so **renaming a source re-reads its items as first seen**, the same as moving it between contexts.

### Errors

Failures anywhere in the daemon — a source that threw, a plugin that failed to load, a config that wouldn't parse — go
to the daemon's log. Adding an `errors` key to a context sends them somewhere you'll actually see:

```yaml
config:
  contexts:
    default:
      destinations:
        updates:
          plugin: log_file
          path: '~/Library/Logs/checker-updates.log'
        failures: # A second log file, so failures aren't buried in the updates
          plugin: log_file
          path: '~/Library/Logs/checker-errors.log'
      errors:
        destinations: [failures] # Optional, by default notify every destination in the context
    myapp:
      errors:
        destinations: [pushover]
```

The default context's `errors` is the fallback: it covers every context that doesn't declare its own, plus the failures
nothing can be attributed to. Above, `myapp`'s failures reach your phone and everything else lands in the log file. Each
failure is reported once, so a source that's been down for a week doesn't notify on every check.

## Writing a plugin

### Sources

Source plugins by default go in `~/.config/checker/plugins/source`. Here's an example, `sheeran.ts`, which is a plugin
that checks whether Ed Sheeran is playing in certain countries any time soon.

```typescript
import BaseSourcePlugin, { SourceConfigSchema } from 'checker/plugins/source';
import CaseInsensitiveComparator from 'checker/comparator/case-insensitive';
import { DOMParser } from 'checker/parse';
import { z } from 'zod';

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

The class name determines the default config key: `SheeranSource` has its `Source` suffix stripped and the rest
snake-cased, giving `sheeran`.

Then you would configure this plugin like so:

```yaml
config:
  sources:
    sheeran:
      items:
        - 'Australia'
```

### Imports available to plugins

Plugins are loaded at runtime, which means they can only import what checker was built with — a distributed binary has
no module cache to fetch from and no network access at load time. Import from these specifiers rather than `jsr:` URLs,
and everything resolves offline:

| Specifier                             | What you get                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `checker/plugins/source`              | `BaseSourcePlugin` (default), `SourceConfigSchema`                                            |
| `checker/plugins/destination`         | `BaseDestinationPlugin` (default), `DestinationConfigSchema`                                  |
| `checker/comparator`                  | `BaseComparator`, to write your own                                                           |
| `checker/comparator/case-insensitive` | `CaseInsensitiveComparator` — any change in text, ignoring case                               |
| `checker/comparator/int`              | `IntComparator` — a bigger number than last time                                              |
| `checker/comparator/semver`           | `SemverComparator` — a higher version, falling back to inequality for tags that aren't semver |
| `checker/comparator/strlen`           | `StrlenComparator` — the text got longer                                                      |
| `checker/parse`                       | `DOMParser`, `parseXml`, `parseYaml`, `parseToml`, `parseCsv`, `parseJsonc`, `unescapeHtml`   |
| `zod`                                 | `z`, for the config schema                                                                    |

Importing anything else fails with `Module not found`; checker logs that and carries on without the plugin, so one bad
plugin can't stop the rest from running.

Adding a plugin file only needs a config save to pick it up, but _editing_ one needs a restart — the runtime caches
modules it has already loaded.

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

The service runs the compiled binary. Every release ships one per target; grab the one matching your machine —
`checker-aarch64-apple-darwin` for Apple Silicon, `checker-x86_64-unknown-linux-gnu` or
`checker-aarch64-unknown-linux-gnu` for Linux.

```shell
mkdir -p ~/.local/bin
curl -fsSL -o ~/.local/bin/checker https://github.com/cameronmurphy/checker/releases/latest/download/checker-aarch64-apple-darwin
chmod +x ~/.local/bin/checker
```

Install the launch agent, substituting your home directory for the placeholder. Run it from the repository root so the
template path resolves.

```shell
mkdir -p ~/Library/LaunchAgents
sed -e "s|__HOME__|$HOME|g" contrib/launchd/com.camurphy.checker.plist \
  > ~/Library/LaunchAgents/com.camurphy.checker.plist

launchctl load ~/Library/LaunchAgents/com.camurphy.checker.plist
```

The agent logs to `~/Library/Logs/checker.log`.

Config changes don't need a restart. Checker watches the config file and re-reads it on save, so adding a source or an
item takes effect within a second; sources whose config didn't change keep their existing schedule and aren't
re-checked. A config that fails to parse is logged and ignored, leaving the running config in place.

Dropping a new plugin into the plugin directory also takes effect on the next config save. Editing an existing plugin
needs the service restarted, as does installing a new binary.
