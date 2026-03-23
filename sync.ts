import { existsSync, readFileSync } from "fs";
import { select, input, confirm } from "@inquirer/prompts";
import { log, run, runQuiet, DOTFILES_DIR } from "./src/utils";
import { setupSymlinks } from "./src/symlinks";
import { commandExists, detectPlatform } from "./src/platform";

const HOME = process.env.HOME!;

interface GpgKey {
  id: string;
  uid: string;
}

async function detectGpgKeys(): Promise<GpgKey[]> {
  const keys: GpgKey[] = [];
  try {
    const raw = await runQuiet(["gpg", "--list-secret-keys", "--keyid-format=long"]);
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const secMatch = lines[i].match(/sec\s+\w+\/(\w+)/);
      if (secMatch) {
        const uid = lines.slice(i + 1, i + 4).find((l) => l.includes("uid"))?.replace(/.*\]\s*/, "").trim() || "unknown";
        keys.push({ id: secMatch[1], uid });
      }
    }
  } catch {}
  return keys;
}

async function getGpgProgram(): Promise<string> {
  try {
    return await runQuiet(["which", "gpg"]);
  } catch {
    return "/usr/bin/gpg";
  }
}

async function selectGpgKey(keys: GpgKey[], prompt: string): Promise<string | null> {
  if (keys.length === 0) return null;
  if (keys.length === 1) {
    log.info(`Found GPG key: ${keys[0].uid} (${keys[0].id})`);
    return keys[0].id;
  }
  return await select({
    message: prompt,
    choices: keys.map((k) => ({ name: `${k.uid} (${k.id})`, value: k.id })),
  });
}

function writeGitIdentity(path: string, name: string, email: string, signingKey: string | null, gpgProgram: string): Promise<number> {
  let content = `[user]\n\tname = ${name}\n\temail = ${email}\n`;
  if (signingKey) {
    content += `\tsigningkey = ${signingKey}\n\n[gpg]\n\tprogram = ${gpgProgram}\n`;
  } else {
    content += `\n[commit]\n\tgpgsign = false\n`;
  }
  return Bun.write(path, content);
}

async function ensureGitconfigLocal() {
  const localConfig = `${HOME}/.gitconfig.local`;
  if (existsSync(localConfig)) return;

  log.step("Setting up ~/.gitconfig.local (default git identity)");

  const name = await input({ message: "Git name (for commits):", default: "Brandon Slinkard" });
  const email = await input({ message: "Git email (for commits):" });

  const keys = await detectGpgKeys();
  const gpgProgram = await getGpgProgram();
  const selectedKey = await selectGpgKey(keys, "Which GPG key for default commits?");

  await writeGitIdentity(localConfig, name, email, selectedKey, gpgProgram);
  log.success(`Created ~/.gitconfig.local (${email})`);
}

async function ensureGitconfigPersonal() {
  const personalConfig = `${HOME}/.gitconfig.personal`;
  if (existsSync(personalConfig)) return;

  log.step("Setting up ~/.gitconfig.personal (for dotfiles repo)");

  const name = await input({ message: "Personal git name:", default: "Brandon Slinkard" });
  const email = await input({ message: "Personal git email:", default: "slinkardbrandon@gmail.com" });

  const keys = await detectGpgKeys();
  const gpgProgram = await getGpgProgram();
  const selectedKey = await selectGpgKey(keys, "Which GPG key for personal commits?");

  await writeGitIdentity(personalConfig, name, email, selectedKey, gpgProgram);
  log.success(`Created ~/.gitconfig.personal (${email})`);
}

async function ensurePersonalSshAlias() {
  const sshConfig = `${HOME}/.ssh/config`;
  const sshDir = `${HOME}/.ssh`;

  // Check if alias already exists
  if (existsSync(sshConfig)) {
    const content = readFileSync(sshConfig, "utf8");
    if (content.includes("github.com-personal")) return;
  }

  // Check if default and personal identity differ (skip on personal-only machines)
  const localConfig = `${HOME}/.gitconfig.local`;
  const personalConfig = `${HOME}/.gitconfig.personal`;
  if (existsSync(localConfig) && existsSync(personalConfig)) {
    const localEmail = readFileSync(localConfig, "utf8").match(/email\s*=\s*(.+)/)?.[1]?.trim();
    const personalEmail = readFileSync(personalConfig, "utf8").match(/email\s*=\s*(.+)/)?.[1]?.trim();
    if (localEmail === personalEmail) return;
  }

  log.step("Setting up SSH alias for personal GitHub (corporate machine detected)");

  // Find personal SSH key
  const defaultKey = `${sshDir}/id_ed25519`;
  const keyPath = await input({
    message: "Path to personal SSH key for GitHub:",
    default: defaultKey,
  });

  if (!existsSync(keyPath)) {
    log.warning(`Key not found at ${keyPath} — skipping SSH alias`);
    log.info("Generate one with: ssh-keygen -t ed25519 -C your@email.com -f " + keyPath);
    return;
  }

  const alias = `\n# Personal GitHub (used by dotfiles repo)\nHost github.com-personal\n    HostName github.com\n    User git\n    IdentityFile ${keyPath}\n`;

  await run(["mkdir", "-p", sshDir]);
  const existing = existsSync(sshConfig) ? readFileSync(sshConfig, "utf8") : "";
  await Bun.write(sshConfig, existing + alias);
  await run(["chmod", "600", sshConfig]);

  log.success("Added github.com-personal SSH alias");

  // Update dotfiles remote to use the alias
  try {
    const remote = await runQuiet(["git", "-C", DOTFILES_DIR, "remote", "get-url", "origin"]);
    if (remote.includes("github.com") && !remote.includes("github.com-personal")) {
      const newRemote = remote.replace("github.com", "github.com-personal");
      await run(["git", "-C", DOTFILES_DIR, "remote", "set-url", "origin", newRemote]);
      log.success(`Updated dotfiles remote: ${newRemote}`);
    }
  } catch {}
}

async function sync() {
  const platform = detectPlatform();
  console.log("\n  dotfiles sync\n");

  // Ensure Brewfile packages are installed (fast — skips already-installed)
  if (platform === "macos" && (await commandExists("brew"))) {
    log.step("Syncing Homebrew packages");
    try {
      await run(["brew", "bundle", "--file", `${DOTFILES_DIR}/Brewfile`, "--no-upgrade"]);
    } catch {
      log.warning("Some packages may have failed (likely already installed via other means)");
    }
  }

  // Ensure all symlinks are correct
  await setupSymlinks();

  // First-time machine setup
  await ensureGitconfigLocal();
  await ensureGitconfigPersonal();
  await ensurePersonalSshAlias();

  log.success("\nSync complete!");
}

sync().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
