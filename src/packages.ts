import { log, run } from "./utils";
import { type Platform, commandExists } from "./platform";

// Packages available on both platforms
const COMMON_PACKAGES = [
  "git",
  "fish",
  "curl",
  "wget",
  "jq",
  "tree",
  "htop",
  "ripgrep",
  "fd",
  "bat",
  "eza",
  "fzf",
  "gh",
  "git-lfs",
  "gnupg",
  "go",
] as const;

// APT package name overrides (where name differs from Homebrew)
const APT_NAME_MAP: Record<string, string> = {
  fd: "fd-find",
  gnupg: "gnupg2",
  go: "golang",
};

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
    // eza is available in Ubuntu 24.04+ repos, otherwise use cargo
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

const MACOS_ONLY_PACKAGES = [
  "pinentry-mac",
  "defaultbrowser",
  "dockutil",
];

const MACOS_CASKS = [
  "google-chrome",
  "font-fira-code-nerd-font",
  "rectangle",
  "localsend",
  "1password",
  "visual-studio-code",
  "obsidian",
];

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

async function installWithBrew(packages: string[]) {
  for (const pkg of packages) {
    log.info(`Installing ${pkg}...`);
    try {
      await run(["brew", "install", pkg]);
    } catch {
      log.warning(`Failed to install ${pkg}, may already be installed`);
    }
  }
}

async function installCasks(casks: string[]) {
  for (const cask of casks) {
    log.info(`Installing ${cask}...`);
    try {
      await run(["brew", "install", "--cask", cask]);
    } catch {
      log.warning(`Failed to install cask ${cask}, may already be installed`);
    }
  }
}

async function installWithApt(packages: string[]) {
  // Filter out packages that need special installation
  const aptPackages = packages
    .filter((pkg) => !LINUX_SPECIAL_INSTALL[pkg])
    .map((pkg) => APT_NAME_MAP[pkg] || pkg);

  if (aptPackages.length > 0) {
    log.info("Updating apt...");
    await run(["sudo", "apt", "update", "-y"]);
    log.info(`Installing: ${aptPackages.join(", ")}...`);
    await run(["sudo", "apt", "install", "-y", ...aptPackages]);
  }

  // Handle special installations
  for (const pkg of packages) {
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
    await installWithBrew([...COMMON_PACKAGES, "starship", ...MACOS_ONLY_PACKAGES]);
    await installCasks(MACOS_CASKS);
  } else {
    await installWithApt([...COMMON_PACKAGES, "starship"]);
    await installLinuxFonts();
  }

  // Post-install: git-lfs
  if (await commandExists("git-lfs")) {
    await run(["git", "lfs", "install"]);
    log.success("Git LFS initialized");
  }

  log.success("Package installation complete");
}
