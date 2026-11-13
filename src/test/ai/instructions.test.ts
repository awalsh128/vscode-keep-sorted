import { expect } from "chai";
import * as fs from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import {
  AddAiInstructionsCommandHandler,
  AGENTS_SECTION_BEGIN,
  claudeMcpAddCommand,
  InstructionsUi,
  InstructionTarget,
  ProposedFile,
  SKILL_PATH,
  withAgentsSection,
  withMcpServer,
} from "../../ai/instructions";
import { McpServerInstaller } from "../../ai/mcpinstall";
import { dedent } from "../../common";
import { EXT_WORKSPACE_DIR, TEST_WORKSPACE_DIR } from "../testing";

const DOCS_DIR = path.join(EXT_WORKSPACE_DIR, "docs", "ai");
const SECTION = `${AGENTS_SECTION_BEGIN}\n\n## Sorted blocks\n`;
const LAUNCH = { command: "node", args: ["/storage/mcp/server/mcp.js"] };

/** Records interactions and answers confirmations with a fixed choice. */
class FakeUi implements InstructionsUi {
  readonly proposed: ProposedFile[] = [];
  readonly terminal: string[] = [];
  readonly clipboard: string[] = [];
  readonly messages: string[] = [];

  constructor(
    private readonly targets: InstructionTarget[],
    private readonly confirm: boolean
  ) {}

  async pickTargets(): Promise<InstructionTarget[]> {
    return this.targets;
  }

  async confirmWrite(file: ProposedFile): Promise<boolean> {
    this.proposed.push(file);
    return this.confirm;
  }

  typeInTerminal(command: string): void {
    this.terminal.push(command);
  }

  async copy(text: string): Promise<void> {
    this.clipboard.push(text);
  }

  info(message: string): void {
    this.messages.push(message);
  }
}

describe("instructions", () => {
  describe("withAgentsSection", () => {
    [
      { name: "a new file", current: undefined, expected: `# Agent instructions\n\n${SECTION}` },
      {
        name: "a file ending in a newline",
        current: "# Rules\n",
        expected: `# Rules\n\n${SECTION}`,
      },
      {
        name: "a file without a final newline",
        current: "# Rules",
        expected: `# Rules\n\n${SECTION}`,
      },
    ].forEach(({ name, current, expected }) => {
      it(`should append the section to ${name}`, () => {
        // Act & Assert
        expect(withAgentsSection(current, SECTION)).to.equal(expected);
      });
    });

    it("should leave a file that already has the section", () => {
      // Act & Assert
      expect(withAgentsSection(`# Rules\n\n${SECTION}`, SECTION)).to.equal(undefined);
    });
  });

  describe("withMcpServer", () => {
    it("should add the server while keeping comments and other servers", () => {
      // Arrange
      const current = dedent`
        {
          // my servers
          "mcpServers": { "other": { "command": "x" } }
        }`;

      // Act
      const result = withMcpServer(current, LAUNCH)!;

      // Assert
      expect(result).to.include("// my servers");
      expect(result).to.include('"other"');
      expect(result).to.include('"keep-sorted"');
    });

    it("should create a configuration for a new file", () => {
      // Act
      const result = withMcpServer(undefined, LAUNCH)!;

      // Assert
      expect(JSON.parse(result)).to.deep.equal({ mcpServers: { "keep-sorted": LAUNCH } });
    });

    it("should leave an identical entry", () => {
      // Arrange
      const current = JSON.stringify({ mcpServers: { "keep-sorted": LAUNCH } });

      // Act & Assert
      expect(withMcpServer(current, LAUNCH)).to.equal(undefined);
    });

    it("should refuse a file that is not a JSON object", () => {
      // Act & Assert
      expect(() => withMcpServer("[1]", LAUNCH)).to.throw(Error, /not a JSON object/);
    });
  });

  describe("claudeMcpAddCommand", () => {
    it("should register the server for the user and quote paths with spaces", () => {
      // Act
      const command = claudeMcpAddCommand({ command: "node", args: ["/a b/mcp.js"] });

      // Assert
      expect(command).to.equal('claude mcp add --scope user keep-sorted -- node "/a b/mcp.js"');
    });
  });

  describe("AddAiInstructionsCommandHandler", () => {
    let storage: string;
    let home: string;
    let installer: McpServerInstaller;

    beforeEach(() => {
      storage = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-storage-"));
      home = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-home-"));
      installer = new McpServerInstaller(EXT_WORKSPACE_DIR, storage);
    });

    afterEach(() => {
      fs.rmSync(storage, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
      // The suite restores files but not the directories the skill target creates.
      fs.rmSync(path.join(TEST_WORKSPACE_DIR, ".claude"), { recursive: true, force: true });
    });

    function handler(ui: FakeUi): AddAiInstructionsCommandHandler {
      return new AddAiInstructionsCommandHandler(DOCS_DIR, installer, ui, home);
    }

    it("should write the skill to the workspace after confirmation", async () => {
      // Arrange
      const ui = new FakeUi(["skill"], true);

      // Act
      await handler(ui).handle();

      // Assert
      const written = fs.readFileSync(path.join(TEST_WORKSPACE_DIR, SKILL_PATH), "utf8");
      expect(written).to.equal(fs.readFileSync(path.join(DOCS_DIR, "install", "SKILL.md"), "utf8"));
      expect(ui.proposed.map((file) => file.label)).to.deep.equal([SKILL_PATH]);
    });

    it("should leave AGENTS.md untouched when the user declines", async () => {
      // Arrange
      const agents = path.join(TEST_WORKSPACE_DIR, "AGENTS.md");
      fs.writeFileSync(agents, "# Rules\n");
      const ui = new FakeUi(["agents"], false);

      // Act
      await handler(ui).handle();

      // Assert
      expect(fs.readFileSync(agents, "utf8")).to.equal("# Rules\n");
      expect(ui.proposed[0].proposed).to.include(AGENTS_SECTION_BEGIN);
    });

    it("should not propose a change when the section is already present", async () => {
      // Arrange
      fs.writeFileSync(path.join(TEST_WORKSPACE_DIR, "AGENTS.md"), `# Rules\n\n${SECTION}`);
      const ui = new FakeUi(["agents"], true);

      // Act
      await handler(ui).handle();

      // Assert
      expect(ui.proposed).to.deep.equal([]);
      expect(ui.messages.join(" ")).to.include("already has");
    });

    it("should install the server and type, not run, the Claude Code command", async () => {
      // Arrange
      const ui = new FakeUi(["claudeMcp"], true);

      // Act
      await handler(ui).handle();

      // Assert
      expect(installer.installed).to.equal(true);
      expect(ui.terminal).to.deep.equal([claudeMcpAddCommand(installer.launchCommand())]);
    });

    it("should add the server to the user's Cursor configuration", async () => {
      // Arrange
      const ui = new FakeUi(["cursorMcp"], true);

      // Act
      await handler(ui).handle();

      // Assert
      const config = JSON.parse(fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"));
      expect(config.mcpServers["keep-sorted"]).to.deep.equal(installer.launchCommand());
    });

    it("should copy the configuration for other clients", async () => {
      // Arrange
      const ui = new FakeUi(["copyMcp"], true);

      // Act
      await handler(ui).handle();

      // Assert
      expect(JSON.parse(ui.clipboard[0])).to.deep.equal({
        mcpServers: { "keep-sorted": installer.launchCommand() },
      });
    });

    it("should do nothing when cancelled", async () => {
      // Arrange
      const ui = new FakeUi([], true);

      // Act
      await handler(ui).handle();

      // Assert
      expect(installer.installed).to.equal(false);
      expect(ui.messages).to.deep.equal([]);
    });
  });
});
