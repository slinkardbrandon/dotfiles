#!/usr/bin/env node
// Per-prompt hook for Claude Code and Codex (UserPromptSubmit): plain stdout is
// added to model context in both. Text lives in brevity.md next to this file.
import { readFileSync } from "node:fs";

try {
  process.stdout.write(readFileSync(new URL("./brevity.md", import.meta.url), "utf8"));
} catch {
  // Missing text must never block a prompt.
}
