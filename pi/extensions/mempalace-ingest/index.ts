/**
 * Ingest pi conversations into mempalace with the right mode and wing.
 *
 * The `mempalace-pi` package already auto-ingests, but it shells
 * `mempalace mine <dir>` with no flags (src/utils.ts, maybeAutoIngest). That
 * has two problems:
 *
 *   1. Default mode is `projects`, not `convos`, and `.jsonl` is in mempalace's
 *      READABLE_EXTENSIONS — so raw transcripts (tool calls, results and all)
 *      get filed as if they were source code.
 *   2. No `--wing`, so the wing falls back to the session directory name:
 *      `users_n1583081_dotfiles` instead of `dotfiles`.
 *
 * It also never ingests on close, only every 15 user messages, so short
 * sessions vanish.
 *
 * So we set MEMPALACE_SUSPEND_AUTOSAVE=1 (fish/config.fish) to gate exactly
 * that one mine call — diary prompts and MCP tools are unaffected — and do the
 * ingest here instead: correct mode, wing slug matching src/copilot-transcripts.ts
 * so pi and Copilot sessions about a repo converge, and on close as well as
 * before compaction.
 *
 * Delete this once https://github.com/juhas96/mempalace-pi grows the flags.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const PALACE_ROOT = join(HOME, ".mempalace");

/**
 * Same slug rules as mempalace's own `_safe_wing_slug`, so a repo mined from
 * pi, Copilot, or a direct `mempalace mine` all land in one wing.
 */
function wingSlug(cwd: string): string {
  const leaf = cwd.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";
  const slug = leaf
    .toLowerCase()
    .replace(/[\s-]/g, "_")
    .replace(/[^\w.']+/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120)
    .replace(/^[_.']+|[_.']+$/g, "");
  return slug || "sessions";
}

function ingestArgs(sessionFile: string, cwd: string) {
  // A single file rather than the session directory: `mine` accepts one
  // conversation file in convos mode, and re-mining every past session on
  // every exit would be wasteful.
  return ["mine", sessionFile, "--mode", "convos", "--wing", wingSlug(cwd)];
}

/**
 * ~/.mempalace missing is mempalace's documented kill switch — if the user
 * cleared it, honour that and stay out of the way.
 */
function palaceAvailable(): boolean {
  return HOME !== "" && existsSync(PALACE_ROOT);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile?.();
    if (!sessionFile || !palaceAvailable()) return;

    // Awaited: the point of a pre-compact ingest is to capture the transcript
    // before it is summarized away. Never throws — a failed ingest must not
    // block compaction, it just means this slice stays unmined.
    try {
      await pi.exec("mempalace", ingestArgs(sessionFile, ctx.cwd), { signal: _event.signal });
    } catch {
      // Ignored on purpose. See above.
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile?.();
    if (!sessionFile || !palaceAvailable()) return;

    // Detached and unref'd: pi is on its way out and must not wait on an
    // embedding run. Mirrors how mempalace's own hooks background their mines.
    try {
      const child = Bun.spawn(["mempalace", ...ingestArgs(sessionFile, ctx.cwd)], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      child.unref();
    } catch {
      // A missing mempalace binary is not worth failing a shutdown over.
    }
  });
}
