import { existsSync, lstatSync, readlinkSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { log, DOTFILES_DIR, run } from "./utils";

interface SymlinkEntry {
  source: string;
  target: string;
}

function getSymlinks(): SymlinkEntry[] {
  const home = process.env.HOME!;
  const fishConfigDir = join(home, ".config", "fish");
  const links: SymlinkEntry[] = [];

  // Fish configuration
  links.push(
    { source: join(DOTFILES_DIR, "fish", "config.fish"), target: join(fishConfigDir, "config.fish") },
    { source: join(DOTFILES_DIR, "fish", "aliases.fish"), target: join(fishConfigDir, "aliases.fish") },
    { source: join(DOTFILES_DIR, "fish", "fish_plugins"), target: join(fishConfigDir, "fish_plugins") },
  );

  // Fish functions — symlink the entire directory so new funcsave'd
  // functions automatically land in the dotfiles repo
  links.push({
    source: join(DOTFILES_DIR, "fish", "functions"),
    target: join(fishConfigDir, "functions"),
  });

  // Git configuration
  links.push(
    { source: join(DOTFILES_DIR, "git", ".gitconfig"), target: join(home, ".gitconfig") },
    { source: join(DOTFILES_DIR, "git", ".gitignore_global"), target: join(home, ".gitignore_global") },
  );

  // Alacritty configuration
  links.push({
    source: join(DOTFILES_DIR, "alacritty", "alacritty.toml"),
    target: join(home, ".config", "alacritty", "alacritty.toml"),
  });

  // Claude Code settings (shared permissions, not credentials or local overrides)
  links.push({
    source: join(DOTFILES_DIR, "claude", "settings.json"),
    target: join(home, ".claude", "settings.json"),
  });

  return links;
}

async function createSymlink(source: string, target: string) {
  // Ensure source exists
  if (!existsSync(source)) {
    log.warning(`Source does not exist, skipping: ${source}`);
    return;
  }

  // Create parent directory
  const parentDir = dirname(target);
  await run(["mkdir", "-p", parentDir]);

  // Handle existing target
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      // Check if it already points to the right place
      if (readlinkSync(target) === source) {
        log.info(`Already linked: ${target}`);
        return;
      }
      await Bun.spawn(["rm", target]).exited;
    } else {
      log.warning(`Backing up: ${target} -> ${target}.backup`);
      await Bun.spawn(["mv", target, `${target}.backup`]).exited;
    }
  } catch {
    // Target doesn't exist, that's fine
  }

  await Bun.spawn(["ln", "-s", source, target]).exited;
  log.success(`Linked: ${basename(target)} -> ${source}`);
}

export async function setupSymlinks() {
  log.step("Creating symlinks");

  const links = getSymlinks();

  for (const { source, target } of links) {
    await createSymlink(source, target);
  }

  log.success("All symlinks created");
  log.info("Fisher plugins will auto-install on first Fish shell launch");
}
