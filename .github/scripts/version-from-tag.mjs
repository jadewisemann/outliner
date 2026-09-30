#!/usr/bin/env node
// Writes a release version into the Tauri config before a tagged build, so
// the installers carry the tag's version (native.yml, desktop and android).
//
//   node .github/scripts/version-from-tag.mjs <version> [config]
//
// The config defaults to src-tauri/tauri.conf.json, relative to the working
// directory (the repository root in CI). It is written back with two-space
// indentation and a final newline, the file's own format, so only the
// version line changes.
import { readFileSync, writeFileSync } from "node:fs";

const [version, file = "src-tauri/tauri.conf.json"] = process.argv.slice(2);
if (!version) {
  console.error("usage: version-from-tag.mjs <version> [config]");
  process.exit(1);
}
const config = JSON.parse(readFileSync(file, "utf8"));
config.version = version;
writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
