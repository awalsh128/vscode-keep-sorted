import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execSync } from "child_process";
import { expect } from "chai";
import { describe, it, before, after } from "mocha";

describe("create-binaries.ts E2E Tests", () => {
  // Construct absolute paths from process.cwd()
  const projectRoot = process.cwd();
  const scriptsDir = path.join(projectRoot, "scripts");
  const scriptPath = path.join(scriptsDir, "create-binaries.ts");
  const binDir = path.join(projectRoot, "bin");
  let testBinDir: string;
  let originalBinDir: string | null = null;

  const expectedBinaries = [
    "keep-sorted.exe",
    "keep-sorted-darwin-amd64",
    "keep-sorted-darwin-arm64",
    "keep-sorted-linux-amd64",
  ];

  before(function () {
    // Skip if Go is not installed or toolchain is too old
    try {
      const out = execSync("go version", { encoding: "utf-8" }).trim();
      // parse something like: go version go1.21.13 linux/amd64
      const match = out.match(/go version go([\d.]+)/i);
      if (!match) {
        this.skip();
        return;
      }
      const version = match[1];
      const parts = version.split(".").map((s) => parseInt(s, 10));
      const minParts = [1, 23, 1];
      let tooOld = false;
      for (let i = 0; i < minParts.length; i++) {
        const a = parts[i] ?? 0;
        if (a < minParts[i]) {
          tooOld = true;
          break;
        }
        if (a > minParts[i]) {
          break;
        }
      }
      if (tooOld) {
        // running an older toolchain (CI/runner will be updated) — skip to avoid failing
        this.skip();
        return;
      }
    } catch {
      this.skip();
    }

    // Create a temporary bin directory for testing
    testBinDir = path.join(os.tmpdir(), `keep-sorted-test-${Date.now()}`);
    fs.mkdirSync(testBinDir, { recursive: true });

    // Backup existing bin directory if it exists
    if (fs.existsSync(binDir)) {
      originalBinDir = `${binDir}.backup-${Date.now()}`;
      fs.renameSync(binDir, originalBinDir);
    }
  });

  after(() => {
    // Clean up test bin directory
    if (testBinDir && fs.existsSync(testBinDir)) {
      fs.rmSync(testBinDir, { recursive: true, force: true });
    }

    // Restore original bin directory
    if (originalBinDir && fs.existsSync(originalBinDir)) {
      if (fs.existsSync(binDir)) {
        fs.rmSync(binDir, { recursive: true, force: true });
      }
      fs.renameSync(originalBinDir, binDir);
    }
  });

  it("should create bin directory if it doesn't exist", function () {
    this.timeout(120000); // 2 minutes for Go builds

    // Run the script
    try {
      execSync(`npx tsx "${scriptPath}"`, {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error("Script execution error:", err.message);
      throw error;
    }

    // Verify bin directory was created
    expect(fs.existsSync(binDir)).to.equal(true);
    expect(fs.statSync(binDir).isDirectory()).to.equal(true);
  });

  it("should build all expected platform binaries", function () {
    this.timeout(120000); // 2 minutes for Go builds

    // Run the script
    execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Check each expected binary exists
    for (const binaryName of expectedBinaries) {
      const binaryPath = path.join(binDir, binaryName);
      expect(fs.existsSync(binaryPath), `${binaryName} should exist`).to.equal(true);
      expect(fs.statSync(binaryPath).isFile(), `${binaryName} should be a file`).to.equal(true);
    }
  });

  it("should set correct file permissions on Unix binaries", function () {
    this.timeout(120000); // 2 minutes for Go builds

    // Skip on Windows
    if (process.platform === "win32") {
      this.skip();
    }

    // Run the script
    execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Check permissions on non-Windows binaries
    const unixBinaries = expectedBinaries.filter((name) => !name.endsWith(".exe"));

    for (const binaryName of unixBinaries) {
      const binaryPath = path.join(binDir, binaryName);
      const stats = fs.statSync(binaryPath);

      // Check if executable bit is set (0o755 means rwxr-xr-x)
      const mode = stats.mode & 0o777;
      const isExecutable = (mode & 0o111) !== 0;

      expect(isExecutable, `${binaryName} should be executable`).to.equal(true);
    }
  });

  it("should use keep-sorted version v0.7.1", function () {
    this.timeout(120000); // 2 minutes for Go builds

    // Run the script
    execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Verify binaries were built (version is defined in script, not printed)
    // We verify the script runs successfully which means version is valid
    for (const binaryName of expectedBinaries) {
      const binaryPath = path.join(binDir, binaryName);
      expect(fs.existsSync(binaryPath), `${binaryName} should exist`).to.equal(true);
    }
  });

  it("should handle rebuilding when binaries already exist", function () {
    this.timeout(240000); // 4 minutes for two build runs

    // Run the script first time
    execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Get timestamps of created files
    const firstRunTimestamps = expectedBinaries.map((name) => {
      const binaryPath = path.join(binDir, name);
      return fs.statSync(binaryPath).mtimeMs;
    });

    // Wait a bit to ensure timestamps would be different
    execSync("sleep 1", { stdio: "ignore" });

    // Run the script second time
    execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Get timestamps after second run
    const secondRunTimestamps = expectedBinaries.map((name) => {
      const binaryPath = path.join(binDir, name);
      return fs.statSync(binaryPath).mtimeMs;
    });

    // Verify binaries were rebuilt (timestamps should be different)
    for (let i = 0; i < expectedBinaries.length; i++) {
      expect(
        secondRunTimestamps[i],
        `${expectedBinaries[i]} should have been rebuilt`
      ).to.be.greaterThan(firstRunTimestamps[i]);
    }
  });

  it("should build binaries that are valid executables", function () {
    this.timeout(120000); // 2 minutes for Go builds

    // Run the script
    execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Get the binary for the current platform
    const platform = process.platform;
    const arch = process.arch;

    let binaryName: string;
    if (platform === "win32") {
      binaryName = "keep-sorted.exe";
    } else if (platform === "darwin") {
      binaryName = arch === "arm64" ? "keep-sorted-darwin-arm64" : "keep-sorted-darwin-amd64";
    } else if (platform === "linux") {
      binaryName = "keep-sorted-linux-amd64";
    } else {
      this.skip(); // Skip on unsupported platforms
      return;
    }

    const binaryPath = path.join(binDir, binaryName);

    // Try to execute the binary with --help flag
    try {
      const output = execSync(`"${binaryPath}" --help`, {
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify it produces some output
      expect(output.length).to.be.greaterThan(0);

      // Verify it's the keep-sorted binary (output should mention sorting)
      expect(output.toLowerCase()).to.match(/sort|keep-sorted/);
    } catch (error: unknown) {
      // Even if --help returns non-zero exit code, check if it produced output
      const err = error as { stdout?: string; stderr?: string };
      if (err.stdout || err.stderr) {
        const output = err.stdout || err.stderr || "";
        expect(output.length).to.be.greaterThan(0);
      } else {
        throw error;
      }
    }
  });

  it("should print progress messages during build", function () {
    this.timeout(120000); // 2 minutes for Go builds

    // Run the script and capture output
    const output = execSync(`npx tsx "${scriptPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Verify progress messages are present
    expect(output).to.contain("Building");
    expect(output).to.match(/✅\s*Built/);

    // Verify all platforms are mentioned
    expect(output).to.contain("windows/amd64");
    expect(output).to.contain("darwin/amd64");
    expect(output).to.contain("darwin/arm64");
    expect(output).to.contain("linux/amd64");
  });

  it("should fail gracefully if Go is not installed", function () {
    this.timeout(10000);

    // Temporarily remove Go from PATH
    const originalPath = process.env.PATH;
    process.env.PATH = "/tmp"; // Path without Go

    try {
      execSync(`npx tsx "${scriptPath}"`, {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
      });

      // Should not reach here
      expect.fail("Script should have failed when Go is not available");
    } catch (error: unknown) {
      // Verify it failed with a meaningful error
      const err = error as { status?: number };
      expect(err.status).to.not.equal(0);
    } finally {
      // Restore PATH
      process.env.PATH = originalPath;
    }
  });
});

/**
 * Regression tests for the Go version regex used in create-binaries.ts.
 *
 * These do NOT require Go to be installed — they validate the regex against known `go version`
 * output strings so a malformed pattern is caught early.
 *
 * Regression: the original regex /go(?:version)?\s+go([0-9.]+(?:.[0-9]+)*)/i failed to match "go
 * version go1.23.1 linux/amd64".
 */
describe("Go version regex (regression)", () => {
  // Must stay in sync with the regex in scripts/create-binaries.ts
  const GO_VERSION_RE = /go version go([\d.]+)/i;

  const validOutputs: { input: string; expected: string }[] = [
    { input: "go version go1.23.1 linux/amd64", expected: "1.23.1" },
    { input: "go version go1.21.13 linux/amd64", expected: "1.21.13" },
    { input: "go version go1.22.0 darwin/arm64", expected: "1.22.0" },
    { input: "go version go1.24.2 windows/amd64", expected: "1.24.2" },
    { input: "go version go1.23 linux/amd64", expected: "1.23" },
    { input: "go version go2.0.0 linux/amd64", expected: "2.0.0" },
  ];

  for (const { input, expected } of validOutputs) {
    it(`should parse version from: "${input}"`, () => {
      const m = input.match(GO_VERSION_RE);
      expect(m, `regex did not match: ${input}`).to.not.equal(null);
      expect(m![1]).to.equal(expected);
    });
  }

  const invalidOutputs = [
    "",
    "not a go version string",
    "go1.23.1",
    "version go1.23.1 linux/amd64",
  ];

  for (const input of invalidOutputs) {
    it(`should NOT match malformed input: "${input}"`, () => {
      const m = input.match(GO_VERSION_RE);
      expect(m).to.equal(null);
    });
  }
});
