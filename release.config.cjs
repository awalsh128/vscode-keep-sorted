/**
 * Semantic-release configuration for the extension. The Publish Extension workflow runs it; see
 * CONTRIBUTING.md#publishing.
 *
 * Releases never commit: the version is written into package.json in the CI workspace only, and the
 * `v<version>` tag is the record of each release.
 */
module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    // Replaces @semantic-release/commit-analyzer; compiled to out/ by `tsc -b`.
    "./out/scripts/release-version.js",
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    // Packages the VSIX for the GitHub release only. The plugin reads registry credentials from
    // tokens, so the workflow publishes with `npm run ops -- publish` (trusted publishing).
    ["semantic-release-vsce", { packageVsix: true, publish: false }],
    [
      "@semantic-release/github",
      { assets: [{ path: "*.vsix", label: "Extension package (VSIX)" }] },
    ],
  ],
};
