// Test file with sorted keep-sorted blocks - NO DIAGNOSTICS SHOULD BE GENERATED
// Used for testing code actions when no issues exist

// First block - already sorted
// keep-sorted start
const alpha = "alpha";
const beta = "beta";
const zebra = "zebra";
// keep-sorted end

export function middleFunction() {
  return "middle content";
}

// Second block - already sorted
// keep-sorted start numeric=yes
const item1 = 1;
const item2 = 2;
const item10 = 10;
// keep-sorted end

export function anotherFunction() {
  return "more content";
}

// Third block - already sorted
// keep-sorted start case=no
const componentA = "a";
const ComponentM = "M";
const ComponentZ = "Z";
// keep-sorted end

export const combined = { alpha, beta, zebra };
export const items = { item1, item2, item10 };
export const components = { componentA, ComponentM, ComponentZ };
