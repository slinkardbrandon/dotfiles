import { existsSync, lstatSync, readlinkSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { log, DOTFILES_DIR, run } from "./utils";
import { detectPlatform, commandExists } from "./platform";

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

  // Fish conf.d — individual symlinks (can't replace the dir; Fisher owns it)
  links.push({
    source: join(DOTFILES_DIR, "fish", "conf.d", "nvm_auto_init.fish"),
    target: join(fishConfigDir, "conf.d", "nvm_auto_init.fish"),
  });

  // Fish completions — individual symlinks (Fisher owns the dir)
  links.push({
    source: join(DOTFILES_DIR, "fish", "completions", "theme.fish"),
    target: join(fishConfigDir, "completions", "theme.fish"),
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

  // Neovim configuration (symlink entire directory)
  links.push({
    source: join(DOTFILES_DIR, "nvim"),
    target: join(home, ".config", "nvim"),
  });

  // Tmux configuration
  links.push({
    source: join(DOTFILES_DIR, "tmux", "tmux.conf"),
    target: join(home, ".tmux.conf"),
  });

  // Lazygit configuration (macOS uses ~/Library/Application Support/)
  const lazygitConfigDir =
    detectPlatform() === "macos"
      ? join(home, "Library", "Application Support", "lazygit")
      : join(home, ".config", "lazygit");
  links.push({
    source: join(DOTFILES_DIR, "lazygit", "config.yml"),
    target: join(lazygitConfigDir, "config.yml"),
  });

  // Bat themes (used by delta for syntax highlighting)
  links.push({
    source: join(DOTFILES_DIR, "bat", "themes"),
    target: join(home, ".config", "bat", "themes"),
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

  // Compile custom terminfo for undercurl support in tmux
  const tiFile = join(DOTFILES_DIR, "tmux", "tmux-256color.ti");
  if (existsSync(tiFile)) {
    try {
      await run(["tic", "-x", tiFile]);
      log.success("Compiled tmux terminfo (undercurl support)");
    } catch {
      log.warning("Could not compile terminfo — run manually: tic -x tmux/tmux-256color.ti");
    }
  }

  // Rebuild bat theme cache so delta picks up symlinked themes
  if (await commandExists("bat")) {
    try {
      await run(["bat", "cache", "--build"]);
      log.success("Bat theme cache rebuilt");
    } catch {
      log.warning("Could not rebuild bat cache — run manually: bat cache --build");
    }
  }
}
