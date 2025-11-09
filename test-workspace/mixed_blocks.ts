// Test file with multiple keep-sorted blocks at different positions
// Used for testing code action range filtering

// First block - lines 4-8
// keep-sorted start
const zebra = "zebra";
const beta = "beta";
const alpha = "alpha";
// keep-sorted end

export function middleFunction() {
  return "middle content";
}

// Second block - lines 16-20
// keep-sorted start numeric=yes
const item10 = 10;
const item2 = 2;
const item1 = 1;
// keep-sorted end

export function anotherFunction() {
  return "more content";
}

// Third block - lines 28-32
// keep-sorted start case=no
const ComponentZ = "Z";
const componentA = "a";
const ComponentM = "M";
// keep-sorted end

export const combined = { zebra, beta, alpha };
export const items = { item1, item2, item10 };
export const components = { ComponentZ, componentA, ComponentM };
