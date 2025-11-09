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

function buildBinary(
  platform: (typeof PLATFORMS)[number],
  goPath: string,
  hostGoos: string,
  hostGoarch: string
): void {
  console.log(`Building ${platform.filename} (${platform.goos}/${platform.goarch})...`);

  execSync(`go install github.com/google/keep-sorted@${KEEP_SORTED_VERSION}`, {
    stdio: "inherit",
    env: { ...process.env, CGO_ENABLED: "0", GOOS: platform.goos, GOARCH: platform.goarch },
  });

  // Determine installed path based on whether it's a native or cross-compiled build
  const isNative = platform.goos === hostGoos && platform.goarch === hostGoarch;
  const binaryName = platform.goos === "windows" ? "keep-sorted.exe" : "keep-sorted";
  const installedPath = isNative
    ? join(goPath, "bin", binaryName)
    : join(goPath, "bin", `${platform.goos}_${platform.goarch}`, binaryName);

  const outputPath = join(BIN_DIR, platform.filename);
  execSync(`mv "${installedPath}" "${outputPath}"`, { stdio: "inherit" });

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

// Cache go env values
const goPath = execSync("go env GOPATH", { encoding: "utf-8" }).trim();
const hostGoos = execSync("go env GOOS", { encoding: "utf-8" }).trim();
const hostGoarch = execSync("go env GOARCH", { encoding: "utf-8" }).trim();

// Build all platforms
for (const platform of PLATFORMS) {
  buildBinary(platform, goPath, hostGoos, hostGoarch);
}
