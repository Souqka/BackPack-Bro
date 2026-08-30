/**
 * Run-scoped flags for incremental placement scoring.
 *
 * Default (no stack): enabled, verification off.
 * Tests and identity benchmarks push { enabled: false } or { verify: true }.
 */

export interface IncrementalScoringOptions {
  enabled: boolean;
  verify: boolean;
}

const DEFAULT_OPTIONS: IncrementalScoringOptions = {
  enabled: true,
  verify: false,
};

let stack: IncrementalScoringOptions[] = [];

export function withIncrementalScoring<T>(options: IncrementalScoringOptions, fn: () => T): T {
  stack.push(options);
  try {
    return fn();
  } finally {
    stack.pop();
  }
}

export function getIncrementalScoringOptions(): IncrementalScoringOptions {
  return stack[stack.length - 1] ?? DEFAULT_OPTIONS;
}

export function isIncrementalScoringEnabled(): boolean {
  return getIncrementalScoringOptions().enabled;
}

export function isIncrementalVerificationEnabled(): boolean {
  return getIncrementalScoringOptions().verify;
}
