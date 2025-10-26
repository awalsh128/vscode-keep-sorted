import * as sourceMapSupport from "source-map-support";

// Enable source map support for better error reporting
sourceMapSupport.install();

// Set the test timeout
const testTimeout =
  typeof process.env.MOCHA_TIMEOUT === "string" ? parseInt(process.env.MOCHA_TIMEOUT, 10) : 5000;

// Add global test utilities if needed
declare global {
  var testTimeout: number;
}

global.testTimeout = testTimeout;
