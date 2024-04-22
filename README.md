# Checker

Get notified when stuff changes.

## Dev setup (macOS)

Install [Homebrew](https://brew.sh).

```shell
brew bundle
```

[Configure your shell](https://asdf-vm.com/guide/getting-started.html#_3-install-asdf) for asdf. Restart your terminal session.

```shell
asdf plugin install deno
asdf install
```

## Scripts

### Update deps

To upgrade all dependencies:

```shell
deno task update-deps
```
