import { AsyncLocalStorage } from 'node:async_hooks';

const MAX_RECORDED = 50;
const MAX_TEXT_LENGTH = 500;

export type RecordedError = {
  context: string | null;
  text: string;
};

const recorded: RecordedError[] = [];
const contextStore = new AsyncLocalStorage<string>();
const suppressStore = new AsyncLocalStorage<boolean>();
let listener: (() => void) | null = null;
let ownedContexts = new Set<string>();

export function setOwnedErrorContexts(contexts: string[]): void {
  ownedContexts = new Set(contexts);
}

export function runWithErrorContext<T>(context: string, fn: () => Promise<T>): Promise<T> {
  return contextStore.run(context, fn);
}

export function suppressErrorRecording<T>(fn: () => Promise<T>): Promise<T> {
  return suppressStore.run(true, fn);
}

export function onErrorRecorded(fn: () => void): void {
  listener = fn;
}

export function recordError(text: string): void {
  if (suppressStore.getStore()) return;

  recorded.push({
    context: contextStore.getStore() ?? null,
    text: text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH),
  });

  if (recorded.length > MAX_RECORDED) {
    recorded.splice(0, recorded.length - MAX_RECORDED);
  }

  listener?.();
}

export function listErrors(context?: string): RecordedError[] {
  return context ? recorded.filter((entry) => entry.context === context) : [...recorded];
}

export function listUnownedErrors(): RecordedError[] {
  return recorded.filter((entry) => entry.context === null || !ownedContexts.has(entry.context));
}

export function captureErrors(): void {
  const original = console.error;

  console.error = (...args: unknown[]) => {
    recordError(args.map((arg) => (typeof arg === 'string' ? arg : Deno.inspect(arg))).join(' '));
    original(...args);
  };
}

export function resetErrors(): void {
  recorded.length = 0;
  listener = null;
  ownedContexts = new Set();
}
