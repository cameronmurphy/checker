import { DEFAULT_CONTEXT } from '../constants.ts';

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function contextLabel(context: string): string {
  return context === DEFAULT_CONTEXT ? '' : `[${context}] `;
}
