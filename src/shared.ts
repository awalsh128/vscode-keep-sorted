import { LRUCache } from "lru-cache";

export const EXECUTE_DELAY_MS = 1000;

// LRU cache to store active timeouts by name and evict past their TTL
const activeTimeouts = new LRUCache<string, NodeJS.Timeout>({
  ttl: EXECUTE_DELAY_MS * 2,
  ttlAutopurge: true,
});

/** Delays execution of a function by a specified debounce delay. */
export function delayAndExecute(name: string, fn: () => Promise<void>): void {
  // Clear any existing timeout for this name
  const existingTimeout = activeTimeouts.get(name);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set a new timeout
  const timeout = setTimeout(async () => {
    await fn().finally(() => {
      // Clean up the timeout from the map
      activeTimeouts.delete(name);
    });
  }, EXECUTE_DELAY_MS);

  // Store the timeout in the map
  activeTimeouts.set(name, timeout);
}

/** Creates a memoized version of a function */
export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cachedResult: any;
  let hasBeenCalled = false;

  return ((...args: unknown[]): unknown => {
    if (!hasBeenCalled) {
      cachedResult = fn(...args);
      hasBeenCalled = true;
    }
    return cachedResult;
  }) as T;
}
