import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import { memoize, delayAndExecute, EXECUTE_DELAY_MS as EXECUTE_DELAY_MS } from "../shared";

// Constants for irrelevant test values
const ANY_RETURN_VALUE = "result";
const ANY_OBJECT_VALUE = 42;
const ANY_FUNCTION_NAME = "test-function";

describe("shared", () => {
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

  describe("delayAndExecute", () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers({
        shouldAdvanceTime: true,
      });
    });

    afterEach(() => {
      clock.restore();
    });

    it("should execute function after delay", () => {
      // Arrange
      let executed = false;
      const fn = async () => {
        executed = true;
      };

      // Act
      delayAndExecute(ANY_FUNCTION_NAME, fn);
      void expect(executed).to.be.false;

      clock.tick(EXECUTE_DELAY_MS);

      // Assert
      void expect(executed).to.be.true;
    });

    it("should cancel previous timeout when called again", () => {
      // Arrange
      let executeCount = 0;
      const fn = async () => {
        executeCount++;
      };

      // Act
      delayAndExecute(ANY_FUNCTION_NAME, fn);
      clock.tick(500); // Half way through delay
      delayAndExecute(ANY_FUNCTION_NAME, fn); // Should cancel first call
      clock.tick(1000); // Complete the second delay

      // Assert
      expect(executeCount).to.equal(1);
    });

    it("should handle multiple named delays independently", () => {
      // Arrange
      let count1 = 0;
      let count2 = 1;
      const fn1 = async () => {
        count1++;
      };
      const fn2 = async () => {
        count2++;
      };

      // Act
      delayAndExecute(ANY_FUNCTION_NAME, fn1);
      delayAndExecute(ANY_FUNCTION_NAME, fn2);
      clock.tick(2000);

      // Assert
      expect(count1).to.equal(1);
      expect(count2).to.equal(2);
    });

    it("should handle function errors gracefully", async () => {
      // Arrange
      const errorMessage = "Test error";
      const fn = async () => {
        throw new Error(errorMessage);
      };

      // Act & Assert
      expect(() => {
        delayAndExecute(ANY_FUNCTION_NAME, fn);
        clock.tick(1000);
      }).to.not.throw();
    });
  });
});
