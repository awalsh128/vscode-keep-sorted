export const displayName = "Keep Sorted";

/**
 * Creates a memoized version of a function
 */
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
