#!/usr/bin/env node

import { mkdirSync, chmodSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const KEEP_SORTED_VERSION = "v0.7.1";
const BIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");

const PLATFORMS = [
  { goos: "windows", goarch: "amd64", filename: "keep-sorted.exe" },
  { goos: "darwin", goarch: "amd64", filename: "keep-sorted-darwin-amd64" },
  { goos: "darwin", goarch: "arm64", filename: "keep-sorted-darwin-arm64" },
  { goos: "linux", goarch: "amd64", filename: "keep-sorted-linux-amd64" },
] as const;

function ensureGoVersion(minVersion = "1.23.1") {
  try {
    const output = execSync("go version", { encoding: "utf-8" }).trim();
    console.log("go version output:", output);

    // output example: go version go1.21.13 linux/amd64
    const m = output.match(/go version go([\d.]+)/i);
    if (!m) {
      throw new Error("unable to parse go version from: " + output);
    }
    const installed = m[1];

    const installedParts = installed.split(".").map((s) => parseInt(s, 10));
    const needParts = minVersion.split(".").map((s) => parseInt(s, 10));

    for (let i = 0; i < needParts.length; i++) {
      const a = installedParts[i] ?? 0;
      const b = needParts[i] ?? 0;
      if (a > b) {
        return; // good
      }
      if (a < b) {
        throw new Error(`Go ${minVersion} or newer is required (installed: ${installed})`);
      }
    }
  } catch (err) {
    throw new Error(`Go check failed: ${(err as Error).message}`);
  }
}

function buildBinary(
  platform: (typeof PLATFORMS)[number]
): void {
  const outputPath = join(BIN_DIR, platform.filename);

  console.log(`Building ${platform.filename} (${platform.goos}/${platform.goarch})...`);

  // Build directly to the desired location using GOOS/GOARCH so we don't rely on GOPATH/GOBIN rules
  execSync(`env CGO_ENABLED=0 GOOS=${platform.goos} GOARCH=${platform.goarch} go build -o "${outputPath}" github.com/google/keep-sorted@${KEEP_SORTED_VERSION}`, {
    stdio: "inherit",
    env: { ...process.env },
  });

  if (platform.goos !== "windows") {
    chmodSync(outputPath, 0o755);
  }

  // Generate SHA256 hash
  const fileBuffer = readFileSync(outputPath);
  const hash = createHash("sha256").update(fileBuffer).digest("hex");
  const hashFilePath = `${outputPath}.sha256`;
  writeFileSync(hashFilePath, hash);

  console.log(`✅ Built ${platform.filename} (SHA256: ${hash})`);
}

mkdirSync(BIN_DIR, { recursive: true });

// Ensure the runner has a sufficiently new Go toolchain
ensureGoVersion("1.23.1");

// Cache go env values and print them for diagnostics
const goPath = execSync("go env GOPATH", { encoding: "utf-8" }).trim();
const hostGoos = execSync("go env GOOS", { encoding: "utf-8" }).trim();
const hostGoarch = execSync("go env GOARCH", { encoding: "utf-8" }).trim();
console.log("GOPATH:", goPath, "host:", hostGoos + '/' + hostGoarch);

// Build all platforms
for (const platform of PLATFORMS) {
  buildBinary(platform);
}
