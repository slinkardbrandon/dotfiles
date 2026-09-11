/**
 * Export Copilot CLI conversations into a format mempalace can mine.
 *
 * Copilot CLI writes every session to ~/.copilot/session-state/<id>/events.jsonl,
 * but mempalace 3.9.0 has no normalizer for that format. Upstream solved this
 * twice — PR #2053 (conversation imports) and PR #1592 (copilot-cli hook
 * harness) — and both were closed unmerged on 2026-08-15 with an offer to
 * rebase; the feature request (#2124) is still open.
 *
 * Rather than fork a uv-installed Python package (which `uv tool upgrade`
 * would silently clobber), this converts each session into the plain
 * [{role, content}] JSON array mempalace's `_collect_claude_messages` already
 * accepts, then mines the result. When upstream lands native support this
 * script detects it and tells you to delete it.
 *
 * Filtering mirrors PR #2053: top-level human and assistant prose only. No
 * tool traffic, no subagent context, no injected skill markdown.
 *
 *   bun run copilot-export           # export + mine changed sessions
 *   bun run copilot-export --dry-run # report what would change
 *   bun run copilot-export --all     # ignore mtimes, re-export everything
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { commandExists } from "./platform";
import { log, run, runQuiet } from "./utils";

const HOME = process.env.HOME ?? "";
if (!HOME) throw new Error("HOME is not set");

const SESSION_STATE_DIR = join(HOME, ".copilot", "session-state");
const EXPORT_DIR = join(HOME, ".cache", "mempalace-copilot");
// Which wings have been mined, and as of when. Tracked separately from export
// state on purpose: exporting and mining fail independently (no palace yet, a
// mine that dies halfway), and tying them together strands staged transcripts
// that nothing will ever pick up again.
const MINE_STATE_FILE = join(EXPORT_DIR, ".mined.json");

// Copilot injects these into the user turn: skill bodies pulled in by a slash
// command, and shell/system notifications. They are machinery, not something
// Brandon said, and they would otherwise dominate the palace. A bare slash
// command ("/lm-guide-deployment") IS real user input and stays.
const INJECTED_USER_PREFIXES = ["<skill-context", "<system_notification>", "<command-message>", "<system-reminder>"];

interface CopilotEvent {
  type?: string;
  agentId?: string | null;
  timestamp?: string;
  data?: {
    content?: string;
    context?: { cwd?: string; repository?: string };
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SessionExport {
  sessionId: string;
  wing: string;
  messages: Message[];
  outputPath: string;
}

/**
 * True once the installed mempalace can read Copilot sessions itself.
 *
 * Resolved through the launcher's shebang rather than whatever `python3`
 * happens to be first on PATH, since mempalace lives in its own uv/pipx venv.
 * Any failure here answers "no" — a missing normalizer just means we keep
 * doing the export ourselves, which is harmless.
 */
async function upstreamSupportsCopilot(): Promise<boolean> {
  try {
    const launcher = (await runQuiet(["bash", "-c", "command -v mempalace"])).trim();
    const shebang = (await runQuiet(["head", "-1", launcher])).trim();
    const interpreter = shebang.startsWith("#!") ? shebang.slice(2).trim().split(/\s+/)[0] : "";
    if (!interpreter) return false;

    const probe = await runQuiet([
      interpreter,
      "-c",
      "import mempalace.normalize as n; print(any('copilot' in a for a in dir(n)))",
    ]);
    return probe.trim() === "True";
  } catch {
    return false;
  }
}

// Mirrors mempalace's own wing slugs (lowercase, underscores) so a Copilot
// session and a pi session about the same repo land in the same wing.
export function wingSlug(cwd: string): string {
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

function isInjectedUserContent(content: string): boolean {
  return INJECTED_USER_PREFIXES.some((prefix) => content.startsWith(prefix));
}

function parseSession(sessionId: string): SessionExport | undefined {
  const eventsPath = join(SESSION_STATE_DIR, sessionId, "events.jsonl");
  if (!existsSync(eventsPath)) return undefined;

  const messages: Message[] = [];
  let cwd = "";

  for (const line of readFileSync(eventsPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let event: CopilotEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === "session.start") {
      cwd = event.data?.context?.cwd ?? "";
      continue;
    }

    // A truthy agentId means the event happened inside a subagent's own
    // context window. That is the subagent's conversation, not ours.
    if (event.agentId) continue;

    const content = (event.data?.content ?? "").trim();
    if (!content) continue;

    if (event.type === "user.message") {
      // Deliberately the raw `content`, not `transformedContent`: the latter
      // is what Copilot sent to the model, prepended with datetime and other
      // injected context.
      if (isInjectedUserContent(content)) continue;
      messages.push({ role: "user", content });
    } else if (event.type === "assistant.message") {
      // Empty content is normal — that's a pure tool-call turn.
      messages.push({ role: "assistant", content });
    }
  }

  // A lone message is a false start, not a conversation worth remembering.
  if (messages.length < 2) return undefined;

  const wing = wingSlug(cwd);
  return { sessionId, wing, messages, outputPath: join(EXPORT_DIR, wing, `${sessionId}.json`) };
}

function needsExport(sessionId: string, outputPath: string, exportAll: boolean): boolean {
  if (exportAll || !existsSync(outputPath)) return true;
  const source = statSync(join(SESSION_STATE_DIR, sessionId, "events.jsonl"));
  return source.mtimeMs > statSync(outputPath).mtimeMs;
}

export async function exportCopilotTranscripts(options: { dryRun?: boolean; all?: boolean } = {}) {
  const { dryRun = false, all = false } = options;

  if (!existsSync(SESSION_STATE_DIR)) {
    log.info("No Copilot CLI sessions found, nothing to export");
    return;
  }

  if (await upstreamSupportsCopilot()) {
    log.warning("mempalace now reads Copilot sessions natively — this exporter is obsolete");
    log.info("Mine them directly: mempalace mine ~/.copilot/session-state --mode convos");
    log.info("Then delete src/copilot-transcripts.ts and its sync wiring");
    return;
  }

  log.step("Exporting Copilot CLI transcripts");

  const sessionIds = readdirSync(SESSION_STATE_DIR).filter((entry) =>
    existsSync(join(SESSION_STATE_DIR, entry, "events.jsonl")),
  );

  const changedWings = new Set<string>();
  let exported = 0;
  let skipped = 0;

  for (const sessionId of sessionIds) {
    const session = parseSession(sessionId);
    if (!session) {
      skipped++;
      continue;
    }

    if (!needsExport(sessionId, session.outputPath, all)) continue;

    if (dryRun) {
      log.info(`would export ${sessionId} → ${session.wing} (${session.messages.length} messages)`);
    } else {
      mkdirSync(join(EXPORT_DIR, session.wing), { recursive: true });
      await Bun.write(session.outputPath, `${JSON.stringify(session.messages, null, 2)}\n`);
    }

    changedWings.add(session.wing);
    exported++;
  }

  log.success(
    `${dryRun ? "Would export" : "Exported"} ${exported} session(s) across ${changedWings.size} wing(s)` +
      (skipped > 0 ? `, skipped ${skipped} with no usable conversation` : ""),
  );

  if (dryRun) return;

  await mineStaleWings();
}

// A wing is stale when any staged transcript in it is newer than the last mine
// we recorded. No record at all means it has never been mined — which is the
// normal state right after `mempalace init`, since the palace did not exist
// when the transcripts were first exported.
async function mineStaleWings() {
  if (!existsSync(EXPORT_DIR)) return;

  if (!(await commandExists("mempalace"))) {
    log.warning("mempalace not installed — transcripts exported but not mined");
    return;
  }

  // ~/.mempalace missing is mempalace's documented kill switch, not an error.
  // Respect it: export the files and let the user decide to init a palace.
  if (!existsSync(join(HOME, ".mempalace"))) {
    log.info(`No palace yet. Transcripts staged in ${EXPORT_DIR}`);
    log.info("Create one with: mempalace init <dir>, then re-run this export to mine them");
    return;
  }

  const mined: Record<string, number> = existsSync(MINE_STATE_FILE)
    ? JSON.parse(readFileSync(MINE_STATE_FILE, "utf8"))
    : {};

  const stale = readdirSync(EXPORT_DIR)
    .filter((wing) => !wing.startsWith("."))
    .filter((wing) => newestExport(wing) > (mined[wing] ?? 0));

  if (stale.length === 0) {
    log.info("All exported wings already mined");
    return;
  }

  log.step(`Mining ${stale.length} wing(s) into the palace`);

  for (const wing of stale) {
    log.info(`Mining ${wing}...`);
    try {
      await run(["mempalace", "mine", join(EXPORT_DIR, wing), "--mode", "convos", "--wing", wing]);
      // Recorded per wing as we go, so an interrupted run doesn't redo the
      // wings it already finished.
      mined[wing] = Date.now();
      await Bun.write(MINE_STATE_FILE, `${JSON.stringify(mined, null, 2)}\n`);
    } catch {
      log.warning(`Failed to mine ${wing} — retry with: mempalace mine ${join(EXPORT_DIR, wing)} --mode convos --wing ${wing}`);
    }
  }
}

function newestExport(wing: string): number {
  let newest = 0;
  for (const file of readdirSync(join(EXPORT_DIR, wing))) {
    if (!file.endsWith(".json")) continue;
    newest = Math.max(newest, statSync(join(EXPORT_DIR, wing, file)).mtimeMs);
  }
  return newest;
}

if (import.meta.main) {
  await exportCopilotTranscripts({
    all: process.argv.includes("--all"),
    dryRun: process.argv.includes("--dry-run"),
  });
}
