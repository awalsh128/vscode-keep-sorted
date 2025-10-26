import { describe, beforeEach, afterEach } from "mocha";
import { use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";

use(sinonChai);

describe("instrumentation", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });
});
