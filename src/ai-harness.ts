import { confirm } from "@inquirer/prompts";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } from "fs";
import { basename, dirname, join } from "path";
import { DOTFILES_DIR, log } from "./utils";

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
  }

  if (backedUp && backupDir) log.info(`AI harness backup: ${backupDir}`);
}
