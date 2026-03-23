import { log, run, DOTFILES_DIR } from "./utils";
import { type Platform, commandExists } from "./platform";

// APT package name overrides (where name differs from Homebrew)
const APT_NAME_MAP: Record<string, string> = {
  fd: "fd-find",
  gnupg: "gnupg2",
  go: "golang",
};

// Packages to install via apt on Linux
const LINUX_APT_PACKAGES = [
  "git",
  "curl",
  "wget",
  "jq",
  "tree",
  "htop",
  "ripgrep",
  "fd",
  "bat",
  "fzf",
  "git-lfs",
  "gnupg",
  "go",
  "tmux",
  "make",
];

// Packages that need special installation on Linux (not in default apt repos)
const LINUX_SPECIAL_INSTALL: Record<string, () => Promise<void>> = {
  starship: async () => {
    if (await commandExists("starship")) return;
    log.info("Installing Starship...");
    await run(["bash", "-c", "curl -sS https://starship.rs/install.sh | sh -s -- -y"]);
  },
  eza: async () => {
    if (await commandExists("eza")) return;
    log.info("Installing eza...");
    try {
      await run(["sudo", "apt", "install", "-y", "eza"]);
    } catch {
      log.warning("eza not in apt repos, installing via cargo...");
      await run(["cargo", "install", "eza"]);
    }
  },
  gh: async () => {
    if (await commandExists("gh")) return;
    log.info("Installing GitHub CLI...");
    await run([
      "bash",
      "-c",
      `(type -p wget >/dev/null || sudo apt install wget -y) && \
       sudo mkdir -p -m 755 /etc/apt/keyrings && \
       wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && \
       sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
       echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
       sudo apt update && sudo apt install gh -y`,
    ]);
  },
  neovim: async () => {
    if (await commandExists("nvim")) return;
    log.info("Installing Neovim (latest via PPA)...");
    await run([
      "bash",
      "-c",
      `sudo add-apt-repository -y ppa:neovim-ppa/unstable && \
       sudo apt update && \
       sudo apt install -y neovim`,
    ]);
  },
  fish: async () => {
    if (await commandExists("fish")) return;
    log.info("Installing Fish shell...");
    await run([
      "bash",
      "-c",
      `sudo apt-add-repository -y ppa:fish-shell/release-3 && \
       sudo apt update && \
       sudo apt install -y fish`,
    ]);
  },
};

async function installHomebrew() {
  if (await commandExists("brew")) {
    log.success("Homebrew already installed");
    log.info("Updating Homebrew...");
    await run(["brew", "update"]);
    return;
  }

  log.info("Installing Homebrew...");
  await run(["bash", "-c", '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"']);
}

async function installXcodeTools() {
  try {
    await run(["xcode-select", "-p"]);
    log.success("Xcode Command Line Tools already installed");
  } catch {
    log.info("Installing Xcode Command Line Tools...");
    await run(["xcode-select", "--install"]);
    log.warning("Please complete the Xcode installation dialog, then re-run setup.");
    process.exit(0);
  }
}

async function installWithApt(packages: string[]) {
  const aptPackages = packages.map((pkg) => APT_NAME_MAP[pkg] || pkg);

  if (aptPackages.length > 0) {
    log.info("Updating apt...");
    await run(["sudo", "apt", "update", "-y"]);
    log.info(`Installing: ${aptPackages.join(", ")}...`);
    await run(["sudo", "apt", "install", "-y", ...aptPackages]);
  }

  // Handle packages that need special installation
  const specialPackages = ["starship", "eza", "gh", "neovim", "fish"];
  for (const pkg of specialPackages) {
    if (LINUX_SPECIAL_INSTALL[pkg]) {
      await LINUX_SPECIAL_INSTALL[pkg]();
    }
  }
}

async function installLinuxFonts() {
  log.info("Installing FiraCode Nerd Font...");
  const fontDir = `${process.env.HOME}/.local/share/fonts`;
  await run(["mkdir", "-p", fontDir]);

  try {
    await run([
      "bash",
      "-c",
      `cd /tmp && \
       curl -fsSLO "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/FiraCode.zip" && \
       unzip -o FiraCode.zip -d "${fontDir}/FiraCode" && \
       fc-cache -fv && \
       rm FiraCode.zip`,
    ]);
    log.success("FiraCode Nerd Font installed");
  } catch {
    log.warning("Failed to install FiraCode Nerd Font");
  }
}

export async function installPackages(platform: Platform) {
  log.step("Installing packages");

  if (platform === "macos") {
    await installXcodeTools();
    await installHomebrew();

    // Brewfile is the single source of truth for macOS packages
    log.info("Installing packages from Brewfile...");
    try {
      await run(["brew", "bundle", "--file", `${DOTFILES_DIR}/Brewfile`, "--no-upgrade"]);
    } catch {
      log.warning("Some packages may have failed (likely conflicts with manually installed apps)");
    }
  } else {
    await installWithApt(LINUX_APT_PACKAGES);
    await installLinuxFonts();

    // Install npm-based LSP tools via bun (Mason's npm symlinks break on WSL)
    log.info("Installing LSP tools via bun...");
    try {
      await run(["bash", "-c", `$HOME/.bun/bin/bun install -g typescript-language-server typescript vscode-langservers-extracted @fsouza/prettierd tree-sitter-cli`]);
    } catch {
      log.warning("Failed to install some LSP tools via bun");
    }
  }

  // Post-install: git-lfs
  if (await commandExists("git-lfs")) {
    await run(["git", "lfs", "install"]);
    log.success("Git LFS initialized");
  }

  log.success("Package installation complete");
}
