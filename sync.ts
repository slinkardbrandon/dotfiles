import { existsSync } from "fs";
import { select } from "@inquirer/prompts";
import { log, run, runQuiet, DOTFILES_DIR } from "./src/utils";
import { setupSymlinks } from "./src/symlinks";
import { commandExists, detectPlatform } from "./src/platform";

const HOME = process.env.HOME!;

async function ensureGitconfigLocal() {
  const localConfig = `${HOME}/.gitconfig.local`;
  if (existsSync(localConfig)) return;

  log.step("Setting up ~/.gitconfig.local");

  // Detect GPG keys
  let keys: { id: string; uid: string }[] = [];
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
  } catch {
    // gpg not installed or no keys
  }

  // Detect gpg binary path
  let gpgProgram = "/usr/bin/gpg";
  try {
    gpgProgram = await runQuiet(["which", "gpg"]);
  } catch {}

  if (keys.length === 0) {
    log.warning("No GPG keys found — creating ~/.gitconfig.local with signing disabled");
    log.info("To enable later: generate a key, then update ~/.gitconfig.local");
    await Bun.write(
      localConfig,
      `[commit]\n\tgpgsign = false\n`,
    );
    return;
  }

  let selectedKey: string;
  if (keys.length === 1) {
    selectedKey = keys[0].id;
    log.info(`Found GPG key: ${keys[0].uid} (${keys[0].id})`);
  } else {
    selectedKey = await select({
      message: "Which GPG key should sign commits?",
      choices: keys.map((k) => ({ name: `${k.uid} (${k.id})`, value: k.id })),
    });
  }

  await Bun.write(
    localConfig,
    `[user]\n\tsigningkey = ${selectedKey}\n\n[gpg]\n\tprogram = ${gpgProgram}\n`,
  );
  log.success(`Created ~/.gitconfig.local (signing key: ${selectedKey})`);
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

  // First-time machine setup for local config files
  await ensureGitconfigLocal();

  log.success("\nSync complete!");
}

sync().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
