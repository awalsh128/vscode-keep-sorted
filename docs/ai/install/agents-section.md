<!-- keep-sorted-ai:begin -->

## Sorted blocks

This repository keeps some lists sorted with [keep-sorted](https://github.com/google/keep-sorted):
the lines between a pair of keep-sorted marker comments stay sorted.

- Wrap only order-independent lines. Middleware, precedence lists, CSS rules, positional arguments,
  and imports with side effects are order-dependent; leave them unwrapped.
- With the Keep Sorted tools available, call `keepSorted_getGuide` (topic `overview`) before adding
  a block, `keepSorted_wrapRange` to add markers, and `keepSorted_run` to sort.
- After sorting, check the diff: only lines inside the block moved, and each item moved whole.

<!-- keep-sorted-ai:end -->
