import * as path from "path";
import * as Mocha from "mocha";
import { sync as globSync } from "glob";

export function run(): Promise<void> {
  // Allow `any` here because Mocha types and our usage are compatible at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocha = new (Mocha as any)({ ui: "bdd", color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname, "..");

  // Support filtering tests via MOCHA_GREP environment variable
  const grep = process.env.MOCHA_GREP;
  if (grep) {
    mocha.grep(grep);
  }

  return new Promise((resolve, reject) => {
    try {
      const files = globSync("**/**.test.js", { cwd: testsRoot });
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}
