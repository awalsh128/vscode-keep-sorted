import { afterEach, beforeEach, describe, it } from "mocha";
import { expect, use } from "chai";
import sinonChai from "sinon-chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { LintScheduler } from "../scheduler";

use(sinonChai);

const DELAY_MS = 300;

function fakeDocument(name: string, isClosed = false): vscode.TextDocument {
  return { uri: vscode.Uri.file(`/workspace/${name}`), isClosed } as vscode.TextDocument;
}

describe("scheduler", () => {
  describe("LintScheduler", () => {
    let clock: sinon.SinonFakeTimers;
    let lint: sinon.SinonStub;
    let scheduler: LintScheduler;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
      lint = sinon.stub();
      scheduler = new LintScheduler(lint, DELAY_MS);
    });

    afterEach(() => {
      scheduler.dispose();
      clock.restore();
    });

    it("should lint once after edits pause", () => {
      // Arrange
      const document = fakeDocument("a.ts");

      // Act
      scheduler.schedule(document);
      clock.tick(DELAY_MS - 1);
      scheduler.schedule(document);
      clock.tick(DELAY_MS - 1);
      const lintedWhileTyping = lint.called;
      clock.tick(1);

      // Assert
      expect(lintedWhileTyping).to.equal(false);
      expect(lint).to.have.been.calledOnceWithExactly(document);
    });

    it("should debounce each document separately", () => {
      // Arrange
      const first = fakeDocument("a.ts");
      const second = fakeDocument("b.ts");

      // Act
      scheduler.schedule(first);
      scheduler.schedule(second);
      clock.tick(DELAY_MS);

      // Assert
      expect(lint.callCount).to.equal(2);
    });

    it("should lint now and drop the waiting lint", () => {
      // Arrange
      const document = fakeDocument("a.ts");
      scheduler.schedule(document);

      // Act
      scheduler.now(document);
      clock.tick(DELAY_MS);

      // Assert
      expect(lint).to.have.been.calledOnceWithExactly(document);
    });

    it("should flush only a waiting lint", () => {
      // Arrange
      const waiting = fakeDocument("a.ts");
      const idle = fakeDocument("b.ts");
      scheduler.schedule(waiting);

      // Act
      scheduler.flush(waiting);
      scheduler.flush(idle);
      clock.tick(DELAY_MS);

      // Assert
      expect(lint).to.have.been.calledOnceWithExactly(waiting);
    });

    it("should skip a document closed while waiting", () => {
      // Arrange
      const document = fakeDocument("a.ts", true);

      // Act
      scheduler.schedule(document);
      clock.tick(DELAY_MS);

      // Assert
      expect(lint.called).to.equal(false);
    });

    it("should drop waiting lints when disposed", () => {
      // Arrange
      scheduler.schedule(fakeDocument("a.ts"));

      // Act
      scheduler.dispose();
      clock.tick(DELAY_MS);

      // Assert
      expect(lint.called).to.equal(false);
    });
  });
});
