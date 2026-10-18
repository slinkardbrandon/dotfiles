import { confirm } from "@inquirer/prompts";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } from "fs";
import { basename, dirname, join } from "path";
import { commandExists } from "./platform";
import { DOTFILES_DIR, log, run, runQuiet } from "./utils";

interface AiHarnessEntry {
  name: string;
  source: string;
  target: string;
  kind: "file" | "dir";
}

interface SetupAiHarnessOptions {
  force?: boolean;
  interactive?: boolean;
}

const HOME = process.env.HOME;
if (!HOME) throw new Error("HOME is not set");

const BACKUP_ROOT = join(HOME, ".config", "dotfiles", "backups", "ai-harness");

const AI_HARNESS_ENTRIES: AiHarnessEntry[] = [
  {
    name: "Claude settings",
    source: join(DOTFILES_DIR, "claude", "settings.json"),
    target: join(HOME, ".claude", "settings.json"),
    kind: "file",
  },
  {
    name: "Pi keybindings",
    source: join(DOTFILES_DIR, "pi", "keybindings.json"),
    target: join(HOME, ".pi", "agent", "keybindings.json"),
    kind: "file",
  },
  {
    name: "Pi extensions",
    source: join(DOTFILES_DIR, "pi", "extensions"),
    target: join(HOME, ".pi", "agent", "extensions"),
    kind: "dir",
  },
  {
    name: "Pi agents",
    source: join(DOTFILES_DIR, "pi", "agents"),
    target: join(HOME, ".pi", "agent", "agents"),
    kind: "dir",
  },
];

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function backupName(entry: AiHarnessEntry) {
  return entry.target.replace(HOME, "home").replaceAll("/", "__");
}

function ensurePrivateDir(path: string) {
  mkdirSync(path, { mode: 0o700, recursive: true });
  chmodSync(path, 0o700);
}

function ensureBackupDir(existing?: string) {
  const backupDir = existing ?? join(BACKUP_ROOT, timestamp());
  ensurePrivateDir(BACKUP_ROOT);
  ensurePrivateDir(backupDir);
  return backupDir;
}

function targetExists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isSymlink(path: string) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function shouldSkipDefault(source: string) {
  return basename(source) === ".gitignore";
}

function copyDefaultEntry(source: string, target: string, kind: AiHarnessEntry["kind"]) {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    dereference: false,
    errorOnExist: false,
    filter: (sourcePath) => !shouldSkipDefault(sourcePath),
    force: true,
    recursive: kind === "dir",
    verbatimSymlinks: true,
  });
}

function copyLocalEntry(source: string, target: string, kind: AiHarnessEntry["kind"]) {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    dereference: false,
    errorOnExist: false,
    force: true,
    recursive: kind === "dir",
    verbatimSymlinks: true,
  });
}

/**
 * Copy any dotfiles-shipped children a directory entry is missing.
 *
 * Directory entries are copy-once, so once ~/.pi/agent/extensions exists a
 * newly shared extension would never reach an existing machine — it would only
 * arrive via `ai-setup --force`, which prompts to reset everything else too.
 * Seeding only absent children keeps machine-local files untouched while still
 * delivering new shared defaults.
 */
function seedMissingChildren(entry: AiHarnessEntry) {
  if (entry.kind !== "dir" || !existsSync(entry.source)) return 0;

  let seeded = 0;
  for (const child of readdirSync(entry.source)) {
    const source = join(entry.source, child);
    if (shouldSkipDefault(source)) continue;

    const target = join(entry.target, child);
    if (targetExists(target)) continue;

    copyDefaultEntry(source, target, lstatSync(source).isDirectory() ? "dir" : "file");
    log.success(`${entry.name}: added ${child} from dotfiles default`);
    seeded++;
  }
  return seeded;
}

function hardenBackupPermissions(path: string) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;

  chmodSync(path, stat.isDirectory() ? 0o700 : 0o600);

  if (!stat.isDirectory()) return;
  for (const child of readdirSync(path)) hardenBackupPermissions(join(path, child));
}

function backupEntry(entry: AiHarnessEntry, backupDir: string) {
  const backupPath = join(backupDir, backupName(entry));
  rmSync(backupPath, { force: true, recursive: true });
  copyLocalEntry(entry.target, backupPath, entry.kind);
  hardenBackupPermissions(backupPath);
  return backupPath;
}

function backupResolvedSymlinkEntry(entry: AiHarnessEntry, backupDir: string) {
  const backupPath = join(backupDir, backupName(entry));
  rmSync(backupPath, { force: true, recursive: true });
  copyLocalEntry(realpathSync(entry.target), backupPath, entry.kind);
  hardenBackupPermissions(backupPath);
  return backupPath;
}

async function printDiff(entry: AiHarnessEntry) {
  if (!targetExists(entry.target)) return;

  const args =
    entry.kind === "dir"
      ? ["diff", "-ruN", "-x", ".gitignore", entry.target, entry.source]
      : ["diff", "-u", entry.target, entry.source];

  const diff = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  const exitCode = await diff.exited;
  if (exitCode === 0) log.info(`${entry.name}: no differences from dotfiles default`);
  else if (exitCode > 1) log.warning(`${entry.name}: could not generate diff`);
}

function migrateSymlink(entry: AiHarnessEntry, backupDir: string) {
  const backupPath = backupResolvedSymlinkEntry(entry, backupDir);
  rmSync(entry.target, { force: true, recursive: false });
  copyLocalEntry(backupPath, entry.target, entry.kind);
  log.success(`${entry.name}: replaced symlink with real ${entry.kind} (preserved current state)`);
}

async function resetFromDotfiles(entry: AiHarnessEntry, backupDir: string) {
  console.log();
  log.warning(`${entry.name} differs from the dotfiles default. Proposed reset diff:`);
  await printDiff(entry);

  const shouldReset = await confirm({
    default: false,
    message: `Reset ${entry.target} from ${basename(entry.source)}? Current state will be backed up first.`,
  });
  if (!shouldReset) {
    log.info(`${entry.name}: kept local state`);
    return false;
  }

  backupEntry(entry, backupDir);
  rmSync(entry.target, { force: true, recursive: true });
  copyDefaultEntry(entry.source, entry.target, entry.kind);
  log.success(`${entry.name}: reset from dotfiles default`);
  return true;
}

export async function setupAiHarnessConfig(options: SetupAiHarnessOptions = {}) {
  const resolvedOptions = {
    force: options.force ?? false,
    interactive: options.interactive ?? true,
  };

  if (resolvedOptions.force && !resolvedOptions.interactive) {
    throw new Error("AI harness force reset requires interactive mode so diffs can be reviewed before overwriting.");
  }

  log.step("Setting up AI harness config");

  let backupDir: string | undefined;
  let backedUp = false;

  for (const entry of AI_HARNESS_ENTRIES) {
    if (!existsSync(entry.source)) {
      log.warning(`${entry.name}: source missing, skipping: ${entry.source}`);
      continue;
    }

    if (isSymlink(entry.target)) {
      backupDir = ensureBackupDir(backupDir);
      backedUp = true;
      migrateSymlink(entry, backupDir);

      if (!resolvedOptions.force) continue;
    }

    if (!targetExists(entry.target)) {
      copyDefaultEntry(entry.source, entry.target, entry.kind);
      log.success(`${entry.name}: created from dotfiles default`);
      continue;
    }

    if (resolvedOptions.force) {
      const nextBackupDir = ensureBackupDir(backupDir);
      const didBackup = await resetFromDotfiles(entry, nextBackupDir);
      if (didBackup) {
        backupDir = nextBackupDir;
        backedUp = true;
      }
      continue;
    }

    log.info(`${entry.name}: local config exists, leaving it alone`);
    seedMissingChildren(entry);
  }

  if (backedUp && backupDir) log.info(`AI harness backup: ${backupDir}`);

  await registerMempalaceMcp();
  await installSlynkToolkit();
}

// ─── mempalace MCP registration ──────────────────────────────────────────────
//
// One palace (~/.mempalace), three harnesses, three different wiring stories:
//
//   pi          — no MCP client at all; the `mempalace-pi` package bridges it
//                 (installed in src/packages.ts, nothing to register here)
//   copilot cli — MCP via ~/.copilot/mcp-config.json, merged below
//   claude code — MCP via `claude mcp add`, plus the hooks already in
//                 claude/settings.json
//
// Only copilot and claude need registering, and neither file can be symlinked
// from dotfiles: copilot's holds plaintext API tokens, and claude writes its
// own runtime state into ~/.claude.json. So we merge a single key instead.
//
// Auto-ingest differs per harness: mempalace's own hooks support claude-code
// and codex, pi is handled by pi/extensions/mempalace-ingest, and Copilot CLI
// has no hook system — its transcripts are ingested after the fact by
// src/copilot-transcripts.ts.
const COPILOT_MCP_CONFIG = join(HOME, ".copilot", "mcp-config.json");

async function registerMempalaceMcp() {
  if (!(await commandExists("mempalace-mcp"))) {
    log.info("mempalace-mcp not installed, skipping MCP registration");
    return;
  }

  await registerMempalaceWithCopilot();
  await registerMempalaceWithClaude();
}

async function registerMempalaceWithCopilot() {
  if (!(await commandExists("copilot"))) return;
  if (!existsSync(COPILOT_MCP_CONFIG)) {
    log.info("Copilot CLI has no mcp-config.json yet, skipping mempalace registration");
    return;
  }

  let config: { mcpServers?: Record<string, unknown> };
  try {
    config = await Bun.file(COPILOT_MCP_CONFIG).json();
  } catch {
    log.warning(`Could not parse ${COPILOT_MCP_CONFIG}, leaving it alone`);
    return;
  }

  const servers = config.mcpServers ?? {};
  if (servers.mempalace) {
    log.info("Copilot CLI: mempalace MCP already registered");
    return;
  }

  // This file carries live API tokens, so back it up privately before writing.
  const backupDir = ensureBackupDir();
  const backupPath = join(backupDir, "home__.copilot__mcp-config.json");
  cpSync(COPILOT_MCP_CONFIG, backupPath);
  chmodSync(backupPath, 0o600);

  config.mcpServers = {
    ...servers,
    // "*" matches the existing entries' shape; copilot only supports tool
    // allowlists, so there is no equivalent of the claude settings denylist.
    mempalace: { tools: ["*"], type: "stdio", command: "mempalace-mcp", args: [] },
  };

  await Bun.write(COPILOT_MCP_CONFIG, `${JSON.stringify(config, null, 4)}\n`);
  chmodSync(COPILOT_MCP_CONFIG, 0o600);
  log.success(`Copilot CLI: registered mempalace MCP (backup: ${backupPath})`);
}

async function registerMempalaceWithClaude() {
  if (!(await commandExists("claude"))) return;

  try {
    const registered = await runQuiet(["claude", "mcp", "list"]);
    if (registered.includes("mempalace")) {
      log.info("Claude Code: mempalace MCP already registered");
      return;
    }
  } catch {
    // `claude mcp list` exits non-zero when nothing is registered yet.
  }

  try {
    await run(["claude", "mcp", "add", "--scope", "user", "mempalace", "--", "mempalace-mcp"]);
    log.success("Claude Code: registered mempalace MCP");
  } catch {
    log.warning("Could not register mempalace with Claude Code — run: claude mcp add --scope user mempalace -- mempalace-mcp");
  }
}

// ─── slynk-toolkit ───────────────────────────────────────────────────────────
//
// slynk-toolkit's installer owns its Claude SessionStart hook and writes an
// absolute path into ~/.claude/settings.json, so the hook must never live in
// claude/settings.json. Cloning to the same place on every machine and running
// the installer in --link mode keeps that path predictable and skill edits live.
// The installer is idempotent, so every sync re-runs it.
const SLYNK_REPO = "https://github.com/slinkardbrandon/slynk-toolkit.git";
const SLYNK_DIR = join(HOME, "personal", "slynk-toolkit");
const NVM_DIR = process.env.nvm_data ?? join(HOME, ".local", "share", "nvm");

// Newest nvm.fish-installed node, mirroring fish/conf.d/nvm_auto_init.fish.
// Bun doesn't inherit fish's nvm activation, so PATH alone can't be trusted.
function findNvmNode() {
  if (!existsSync(NVM_DIR)) return undefined;
  const versions = readdirSync(NVM_DIR)
    .filter((name) => name.startsWith("v") && existsSync(join(NVM_DIR, name, "bin", "node")))
    .sort((a, b) => Bun.semver.order(a.slice(1), b.slice(1)));
  const latest = versions.at(-1);
  return latest ? join(NVM_DIR, latest, "bin", "node") : undefined;
}

async function resolveNode() {
  const nvmNode = findNvmNode();
  if (nvmNode) return nvmNode;
  if (await commandExists("node")) return "node";

  log.info("No node found, installing LTS via nvm.fish");
  await run(["fish", "-c", "nvm install lts"]);
  return findNvmNode();
}

async function installSlynkToolkit() {
  if (!existsSync(SLYNK_DIR)) {
    try {
      await run(["git", "clone", SLYNK_REPO, SLYNK_DIR]);
    } catch {
      log.warning(`Could not clone slynk-toolkit, run: git clone ${SLYNK_REPO} ${SLYNK_DIR}`);
      return;
    }
  }

  let node: string | undefined;
  try {
    node = await resolveNode();
  } catch {
    // Handled below: nvm.fish may not be installed until fisher's first run.
  }
  if (!node) {
    log.warning("slynk-toolkit: node unavailable, skipping install. Run: nvm install lts");
    return;
  }

  try {
    await runQuiet([node, join(SLYNK_DIR, "bin", "slynk-toolkit.mjs"), "--link"]);
    log.success(`slynk-toolkit: linked from ${SLYNK_DIR}`);
  } catch {
    log.warning(`slynk-toolkit: install failed. Run: node ${SLYNK_DIR}/bin/slynk-toolkit.mjs --link`);
  }
}
