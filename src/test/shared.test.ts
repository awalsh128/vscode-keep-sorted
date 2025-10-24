import { describe, it } from "mocha";
import { expect } from "chai";
import { displayName, memoize } from "../shared";

// Constants for irrelevant test values
const EXPECTED_EXTENSION_NAME = "Keep Sorted";
const ANY_RETURN_VALUE = "result";
const ANY_OBJECT_VALUE = 42;

describe("shared", () => {
  describe("displayName", () => {
    it("should have the correct extension name", () => {
      // Act
      const result = displayName;

      // Assert
      expect(result).to.equal(EXPECTED_EXTENSION_NAME);
    });

    it("should be a string", () => {
      // Act
      const result = displayName;

      // Assert
      expect(result).to.be.a("string");
    });
  });

  describe("memoize", () => {
    it("should execute function once and cache result", () => {
      // Arrange
      let callCount = 0;
      const fn = memoize(() => {
        callCount++;
        return ANY_RETURN_VALUE;
      });

      // Act
      const result1 = fn();
      const result2 = fn();
      const result3 = fn();

      // Assert
      expect(result1).to.equal(ANY_RETURN_VALUE);
      expect(result2).to.equal(ANY_RETURN_VALUE);
      expect(result3).to.equal(ANY_RETURN_VALUE);
      expect(callCount).to.equal(1);
    });

    it("should cache different return values", () => {
      // Arrange
      let counter = 0;
      const fn = memoize(() => {
        counter++;
        return counter;
      });

      // Act
      const firstCall = fn();
      const secondCall = fn();
      const thirdCall = fn();

      // Assert
      expect(firstCall).to.equal(1);
      expect(secondCall).to.equal(1); // Should return cached value
      expect(thirdCall).to.equal(1); // Should return cached value
    });

    it("should work with functions that return objects", () => {
      // Arrange
      let callCount = 0;
      const fn = memoize(() => {
        callCount++;
        return { value: ANY_OBJECT_VALUE };
      });

      // Act
      const result1 = fn();
      const result2 = fn();

      // Assert
      expect(result1).to.deep.equal({ value: ANY_OBJECT_VALUE });
      expect(result2).to.deep.equal({ value: ANY_OBJECT_VALUE });
      expect(result1).to.equal(result2); // Same reference
      expect(callCount).to.equal(1);
    });

    it("should work with functions that take arguments (but ignores them)", () => {
      // Arrange
      let callCount = 0;
      const fn = memoize(((x: number) => {
        callCount++;
        return x * 2;
      }) as (...args: unknown[]) => unknown);

      // Act
      const firstResult = fn(5);
      const secondResult = fn(10);

      // Assert
      expect(firstResult).to.equal(10);
      expect(secondResult).to.equal(10); // Returns cached result
      expect(callCount).to.equal(1);
    });

    it("should preserve function signature", () => {
      // Arrange
      const fn = memoize((() => 42) as (...args: unknown[]) => unknown);

      // Act
      const result = fn();

      // Assert
      expect(result).to.equal(42);
      expect(result).to.be.a("number");
    });

    it("should work with functions returning undefined", () => {
      // Arrange
      let callCount = 0;
      const fn = memoize(() => {
        callCount++;
        return undefined;
      });

      // Act
      const result1 = fn();
      const result2 = fn();

      // Assert
      expect(result1).to.equal(undefined);
      expect(result2).to.equal(undefined);
      expect(callCount).to.equal(1);
    });

    it("should work with functions returning null", () => {
      // Arrange
      let callCount = 0;
      const fn = memoize(() => {
        callCount++;
        return null;
      });

      // Act
      const result1 = fn();
      const result2 = fn();

      // Assert
      expect(result1).to.equal(null);
      expect(result2).to.equal(null);
      expect(callCount).to.equal(1);
    });

    it("should work with functions returning boolean", () => {
      // Arrange
      let callCount = 0;
      const fn = memoize(() => {
        callCount++;
        return true;
      });

      // Act
      const result1 = fn();
      const result2 = fn();

      // Assert
      expect(result1).to.equal(true);
      expect(result2).to.equal(true);
      expect(callCount).to.equal(1);
    });
  });
});
