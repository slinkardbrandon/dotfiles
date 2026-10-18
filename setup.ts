import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { log } from "./src/utils";
import { detectPlatform, isWSL } from "./src/platform";
import { installPackages } from "./src/packages";
import { setupSymlinks } from "./src/symlinks";
import { setupFish } from "./src/fish";
import { setupKeys } from "./src/keys";
import { ensureGitconfigLocal, ensureGitconfigPersonal } from "./src/git";
import { applyMacOSDefaults, configureDock, configureLoginItems } from "./src/macos";
import { getActiveTheme, generateConfigs } from "./src/theme";
import { setupAiHarnessConfig } from "./src/ai-harness";

async function main() {
  const platform = detectPlatform();
  const wsl = isWSL();

  console.log(chalk.bold.cyan("\n  dotfiles setup\n"));
  console.log(`  Platform: ${chalk.yellow(platform)}${wsl ? chalk.gray(" (WSL)") : ""}`);
  console.log(`  Home:     ${chalk.yellow(process.env.HOME)}`);
  console.log();

  // Step 1: Install packages
  const doPackages = await confirm({ message: "Install packages?", default: true });
  if (doPackages) {
    await installPackages(platform);
  }

  // Step 2: Create symlinks
  const doSymlinks = await confirm({ message: "Create config symlinks?", default: true });
  if (doSymlinks) {
    await setupSymlinks();
    const theme = await getActiveTheme();
    await generateConfigs(theme);
    log.success(`Generated configs for ${theme.name} theme`);
  }

  // Step 2b: AI harness defaults (copy-once; local config may diverge)
  await setupAiHarnessConfig({ force: false });

  // Step 3: Set up Fish shell
  const doFish = await confirm({ message: "Set up Fish as default shell?", default: true });
  if (doFish) {
    await setupFish(platform);
  }

  // Step 4: GPG/SSH keys
  const doKeys = await confirm({ message: "Set up GPG/SSH keys?", default: false });
  if (doKeys) {
    await setupKeys(platform);
  }

  // Step 5: Git identity (machine-specific name/email). Runs after keys so it
  // picks up any signing key just generated; no-ops if identity already set.
  await ensureGitconfigLocal();
  await ensureGitconfigPersonal();

  // Step 6: macOS-specific
  if (platform === "macos") {
    const doDefaults = await confirm({ message: "Apply macOS defaults?", default: true });
    if (doDefaults) {
      await applyMacOSDefaults();
    }

    const doDock = await confirm({ message: "Configure Dock (remove bloat, add core apps)?", default: true });
    if (doDock) {
      await configureDock();
    }

    await configureLoginItems();
  }

  // Done
  console.log(chalk.bold.green("\n  Setup complete!\n"));
  const nextSteps = [
    "Restart your terminal or run: exec fish",
    "Fisher will auto-install plugins on first Fish launch",
  ];
  if (platform === "macos") {
    nextSteps.push("Grant accessibility permissions for Rectangle", "Sign in to 1Password, VS Code, Chrome");
  }
  console.log("  Next steps:");
  nextSteps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
  console.log();

  // Live reload only watches config files that existed at launch, and fonts
  // are resolved once at startup, so an Alacritty opened before setup keeps
  // its defaults (or a missing-font error) until it is fully restarted.
  if (wsl) {
    console.log(chalk.bold.yellow("  Close every Alacritty window and reopen it to pick up the new config and fonts.\n"));
  }
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
