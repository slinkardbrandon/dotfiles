import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { existsSync, copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import { log } from "./src/utils";
import { detectPlatform, isWSL } from "./src/platform";
import { installPackages } from "./src/packages";
import { setupSymlinks } from "./src/symlinks";
import { setupFish } from "./src/fish";
import { setupKeys } from "./src/keys";
import { applyMacOSDefaults, configureDock } from "./src/macos";
import { getActiveTheme, generateConfigs } from "./src/theme";

const DOTFILES_DIR = process.env.HOME ? join(process.env.HOME, "dotfiles") : "";

function setupClaudeCode() {
  const home = process.env.HOME!;
  const targetDir = join(home, ".claude");
  const targetFile = join(targetDir, "settings.json");
  const templateFile = join(DOTFILES_DIR, "claude", "settings.json");

  if (existsSync(targetFile)) {
    log.info("Claude Code settings already exist, skipping");
    return;
  }

  mkdirSync(targetDir, { recursive: true });
  copyFileSync(templateFile, targetFile);
  log.success("Created Claude Code settings from template");
}

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

  // Step 2b: Claude Code settings (one-time copy from template)
  setupClaudeCode();

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

  // Step 5: macOS-specific
  if (platform === "macos") {
    const doDefaults = await confirm({ message: "Apply macOS defaults?", default: true });
    if (doDefaults) {
      await applyMacOSDefaults();
    }

    const doDock = await confirm({ message: "Configure Dock (remove bloat, add core apps)?", default: true });
    if (doDock) {
      await configureDock();
    }
  }

  // Done
  console.log(chalk.bold.green("\n  Setup complete!\n"));
  console.log("  Next steps:");
  console.log("  1. Restart your terminal or run: exec fish");
  console.log("  2. Fisher will auto-install plugins on first Fish launch");
  if (platform === "macos") {
    console.log("  3. Grant accessibility permissions for Rectangle");
    console.log("  4. Sign in to 1Password, VS Code, Chrome");
  }
  console.log();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
