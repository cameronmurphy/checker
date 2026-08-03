import type { ConfiguredContext } from '../plugins/configure.ts';
import {
  listErrors,
  listUnownedErrors,
  onErrorRecorded,
  setOwnedErrorContexts,
  suppressErrorRecording,
} from '../db/errors.ts';
import { contextLabel, describeError } from '../utils/format.ts';
import { DEFAULT_CONTEXT } from '../constants.ts';

const DEBOUNCE_MS = 500;
const RETRY_MS = 60_000;

export default class ErrorReporter {
  private contexts: ConfiguredContext[] = [];
  private reported = new Map<string, Set<string>>();
  private queue = Promise.resolve();
  private debouncing = false;
  private retrying = false;

  constructor() {
    onErrorRecorded(() => this.debounce());
  }

  public sync(contexts: ConfiguredContext[]): void {
    this.contexts = contexts;

    setOwnedErrorContexts(
      contexts
        .filter(({ name, errors }) => name !== DEFAULT_CONTEXT && errors !== undefined)
        .map(({ name }) => name),
    );

    // Error reporting enabled mid-run adopts what the buffer already holds: it was reported on the
    // daemon's own log at the time.
    for (const { name, errors } of contexts) {
      if (errors && !this.reported.has(name)) {
        this.reported.set(name, new Set(this.lines(name)));
      }
    }
  }

  public report(): Promise<void> {
    this.queue = this.queue
      .then(() => this.reportAll())
      .catch((error) => console.error(`Error reporting failed: ${describeError(error)}`));

    return this.queue;
  }

  private async reportAll(): Promise<void> {
    for (const { name, destinations, errors } of this.contexts) {
      if (!errors) continue;

      const reported = this.reported.get(name) ?? new Set<string>();
      this.reported.set(name, reported);

      const fresh = this.lines(name).filter((line) => !reported.has(line));
      if (fresh.length === 0) continue;

      const scope = name === DEFAULT_CONTEXT ? '' : ` in ${name}`;
      const msg = fresh.length === 1
        ? `checker hit an error${scope}: ${fresh[0]}`
        : `checker hit ${fresh.length} errors${scope}, latest: ${fresh[fresh.length - 1]}`;

      console.log(`${contextLabel(name)}${msg}`);

      const targets = errors.destinations
        ? destinations.filter((destination) => errors.destinations!.includes(destination.getAlias()))
        : destinations;

      const accepted = await suppressErrorRecording(async () => {
        const delivered = await Promise.all(
          targets.map((destination) =>
            destination.notify(msg).catch((error) => {
              console.error(`Destination ${destination.getAlias()} failed: ${describeError(error)}`);
              return false;
            })
          ),
        );

        return targets.length === 0 || delivered.some(Boolean);
      });

      if (accepted) {
        fresh.forEach((line) => reported.add(line));
      } else {
        this.retry();
      }
    }
  }

  private lines(context: string): string[] {
    const entries = context === DEFAULT_CONTEXT ? listUnownedErrors() : listErrors(context);
    const lines = entries.map((entry) => {
      const label = context === DEFAULT_CONTEXT && entry.context && entry.context !== DEFAULT_CONTEXT
        ? `[${entry.context}] `
        : '';
      return `${label}${entry.text}`;
    });

    const seen = new Set<string>();
    const deduped: string[] = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      if (seen.has(lines[i])) continue;

      seen.add(lines[i]);
      deduped.unshift(lines[i]);
    }

    return deduped;
  }

  private debounce(): void {
    if (this.debouncing) return;

    this.debouncing = true;
    setTimeout(() => {
      this.debouncing = false;
      this.report();
    }, DEBOUNCE_MS);
  }

  private retry(): void {
    if (this.retrying) return;

    this.retrying = true;
    setTimeout(() => {
      this.retrying = false;
      this.report();
    }, RETRY_MS);
  }
}
