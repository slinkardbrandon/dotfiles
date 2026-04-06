import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { select, input, confirm } from "@inquirer/prompts";
import { log, run, runQuiet, DOTFILES_DIR } from "./src/utils";
import { setupSymlinks } from "./src/symlinks";
import { commandExists, detectPlatform } from "./src/platform";
import { installSpecialPackages, LINUX_APT_PACKAGES, APT_NAME_MAP } from "./src/packages";
import { getActiveTheme, generateConfigs } from "./src/theme";

const HOME = process.env.HOME!;
const SSH_DIR = join(HOME, ".ssh");

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

async function ensureSshKeyExists() {
  const ed25519 = join(SSH_DIR, "id_ed25519");
  const rsa = join(SSH_DIR, "id_rsa");

  if (existsSync(ed25519) || existsSync(rsa)) {
    const keyType = existsSync(ed25519) ? "ed25519" : "rsa";
    log.info(`SSH key found (~/.ssh/id_${keyType})`);
    return;
  }

  log.warning("No SSH key found (~/.ssh/id_ed25519 or id_rsa)");

  const generate = await confirm({ message: "Generate a new SSH key?" });
  if (!generate) {
    log.info("Skipping SSH key generation");
    return;
  }

  // Try to read email from existing git identity files
  let defaultEmail = "";
  for (const cfg of [`${HOME}/.gitconfig.personal`, `${HOME}/.gitconfig.local`]) {
    if (existsSync(cfg)) {
      const match = readFileSync(cfg, "utf8").match(/email\s*=\s*(.+)/);
      if (match) { defaultEmail = match[1].trim(); break; }
    }
  }

  const email = await input({
    message: "Email for SSH key:",
    default: defaultEmail || undefined,
  });

  await run(["mkdir", "-p", SSH_DIR]);
  await run(["chmod", "700", SSH_DIR]);
  await run(["ssh-keygen", "-t", "ed25519", "-C", email, "-f", ed25519]);
  log.success(`SSH key generated: ${ed25519}`);

  // Add to ssh-agent
  const platform = detectPlatform();
  try {
    await run(["bash", "-c", 'eval "$(ssh-agent -s)" > /dev/null 2>&1']);
    if (platform === "macos") {
      await run(["ssh-add", "--apple-use-keychain", ed25519]);
    } else {
      await run(["ssh-add", ed25519]);
    }
    log.success("Key added to ssh-agent");
  } catch {
    log.warning("Could not add key to ssh-agent — add manually with: ssh-add ~/.ssh/id_ed25519");
  }

  // Offer to upload to GitHub
  if (await commandExists("gh")) {
    const upload = await confirm({ message: "Upload SSH key to GitHub?" });
    if (upload) {
      try {
        await run(["gh", "auth", "status"]);
        const hostname = (await runQuiet(["hostname"])).trim();
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        await run(["gh", "ssh-key", "add", `${ed25519}.pub`, "--title", `${hostname}-${date}`]);
        log.success("SSH key uploaded to GitHub");
      } catch {
        log.warning("Could not upload — ensure you're authenticated with: gh auth login");
      }
    }
  }
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

  // Show available keys so user can pick the right one
  const sshFiles = existsSync(sshDir)
    ? readdirSync(sshDir).filter((f) => {
        const full = join(sshDir, f);
        return (
          statSync(full).isFile() &&
          !f.endsWith(".pub") &&
          f !== "config" &&
          f !== "known_hosts" &&
          f !== "known_hosts.old" &&
          f !== "authorized_keys"
        );
      })
    : [];

  if (sshFiles.length > 0) {
    log.info("SSH keys in ~/.ssh/:");
    for (const f of sshFiles) {
      const pub = existsSync(join(sshDir, `${f}.pub`)) ? " (has .pub)" : "";
      console.log(`    ${f}${pub}`);
    }
  }

  // Find personal SSH key
  let keyPath: string;
  const keyChoices = sshFiles
    .filter((f) => existsSync(join(sshDir, `${f}.pub`)))
    .map((f) => ({ name: `~/.ssh/${f}`, value: join(sshDir, f) }));

  if (keyChoices.length > 1) {
    keyPath = await select({
      message: "Which SSH key is your personal key for GitHub?",
      choices: keyChoices,
    });
  } else if (keyChoices.length === 1) {
    keyPath = keyChoices[0].value;
    log.info(`Using ${keyChoices[0].name}`);
  } else {
    keyPath = await input({
      message: "Path to personal SSH key for GitHub:",
      default: `${sshDir}/id_ed25519`,
    });
  }

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
    } else if (remote.includes("github-personal") && !remote.includes("github.com-personal")) {
      const newRemote = remote.replace("github-personal", "github.com-personal");
      await run(["git", "-C", DOTFILES_DIR, "remote", "set-url", "origin", newRemote]);
      log.success(`Fixed dotfiles remote to use github.com-personal`);
    }
  } catch {}
}

async function sync() {
  const platform = detectPlatform();
  console.log("\n  dotfiles sync\n");

  // Ensure packages are installed (fast — skips already-installed)
  if (platform === "macos" && (await commandExists("brew"))) {
    log.step("Syncing Homebrew packages");
    try {
      await run(["brew", "bundle", "--file", `${DOTFILES_DIR}/Brewfile`, "--no-upgrade"]);
    } catch {
      log.warning("Some packages may have failed (likely already installed via other means)");
    }
  } else if (platform === "linux") {
    log.step("Syncing Linux packages");
    const aptPackages = LINUX_APT_PACKAGES.map((pkg) => APT_NAME_MAP[pkg] || pkg);
    await run(["sudo", "apt", "update", "-y"]);
    await run(["sudo", "apt", "upgrade", "-y", ...aptPackages]);
    await installSpecialPackages();
  }

  // Ensure all symlinks are correct
  await setupSymlinks();

  // Regenerate themed configs
  const theme = await getActiveTheme();
  await generateConfigs(theme);
  log.success(`Generated configs for ${theme.name} theme`);

  // First-time machine setup
  await ensureSshKeyExists();
  await ensureGitconfigLocal();
  await ensureGitconfigPersonal();
  await ensurePersonalSshAlias();

  log.success("\nSync complete!");
}

sync().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
