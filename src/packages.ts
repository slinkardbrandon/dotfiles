import { log, run, runQuiet, DOTFILES_DIR } from "./utils";
import { type Platform, commandExists, isWSL } from "./platform";

// APT package name overrides (where name differs from Homebrew)
export const APT_NAME_MAP: Record<string, string> = {
  fd: "fd-find",
  gnupg: "gnupg2",
  go: "golang",
};

// Packages to install via apt on Linux
export const LINUX_APT_PACKAGES = [
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
  "build-essential",
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
  lazygit: async () => {
    if (await commandExists("lazygit")) return;
    log.info("Installing lazygit...");
    await run([
      "bash",
      "-c",
      `mkdir -p ~/.local/bin && \
       LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": "v\\K[^"]*') && \
       curl -Lo /tmp/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_\${LAZYGIT_VERSION}_Linux_x86_64.tar.gz" && \
       tar xf /tmp/lazygit.tar.gz -C /tmp lazygit && \
       install /tmp/lazygit ~/.local/bin/ && \
       rm /tmp/lazygit /tmp/lazygit.tar.gz`,
    ]);
  },
  delta: async () => {
    if (await commandExists("delta")) return;
    log.info("Installing delta...");
    await run([
      "bash",
      "-c",
      `mkdir -p ~/.local/bin && \
       DELTA_VERSION=$(curl -s "https://api.github.com/repos/dandavison/delta/releases/latest" | grep -Po '"tag_name": "\\K[^"]*') && \
       curl -Lo /tmp/delta.tar.gz "https://github.com/dandavison/delta/releases/latest/download/delta-\${DELTA_VERSION}-x86_64-unknown-linux-gnu.tar.gz" && \
       tar xf /tmp/delta.tar.gz -C /tmp && \
       install /tmp/delta-\${DELTA_VERSION}-x86_64-unknown-linux-gnu/delta ~/.local/bin/ && \
       rm -rf /tmp/delta.tar.gz /tmp/delta-\${DELTA_VERSION}-x86_64-unknown-linux-gnu`,
    ]);
  },
  fish: async () => {
    if (await commandExists("fish")) return;
    log.info("Installing Fish shell...");
    await run([
      "bash",
      "-c",
      `sudo apt install -y fish || ( \
       sudo apt-add-repository -y ppa:fish-shell/release-4 && \
       sudo apt update && \
       sudo apt install -y fish )`,
    ]);
  },
  claude: async () => {
    if (await commandExists("claude")) return;
    log.info("Installing Claude Code CLI...");
    await run(["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"]);
  },
  pi: async () => {
    if (await commandExists("pi")) return;
    log.info("Installing pi coding agent...");
    await run(["bash", "-c", "$HOME/.bun/bin/bun install -g --ignore-scripts @earendil-works/pi-coding-agent"]);
  },
  // OpenWhispr is a GUI dictation app: its global hotkey and auto-paste act on
  // whichever desktop session owns the focused window. Under WSL that session
  // is Windows, never WSLg, so the Linux build could only ever type into Linux
  // GUI apps — useless next to a Windows Alacritty. WSL therefore installs the
  // Windows build through winget interop; a native Linux desktop gets the .deb.
  openwhispr: async () => {
    if (isWSL()) {
      await installOnWindowsHost(
        "OpenWhispr",
        "OpenWhispr.OpenWhispr",
        "https://github.com/OpenWhispr/openwhispr/releases/latest",
      );
      return;
    }
    if (await commandExists("openwhispr")) return;
    log.info("Installing OpenWhispr...");
    await run([
      "bash",
      "-c",
      `OW_VERSION=$(curl -s "https://api.github.com/repos/OpenWhispr/openwhispr/releases/latest" | grep -Po '"tag_name": "v\\K[^"]*') && \
       curl -Lo /tmp/openwhispr.deb "https://github.com/OpenWhispr/openwhispr/releases/download/v\${OW_VERSION}/OpenWhispr-\${OW_VERSION}-linux-amd64.deb" && \
       sudo apt install -y /tmp/openwhispr.deb && \
       rm /tmp/openwhispr.deb`,
    ]);
  },
  // Under WSL the terminal is Windows Alacritty, which reads the config that
  // theme.ts mirrors into %APPDATA%. A native Linux desktop brings its own
  // terminal, so this is WSL-only.
  alacritty: async () => {
    if (!isWSL()) return;
    await installOnWindowsHost(
      "Alacritty",
      "Alacritty.Alacritty",
      "https://github.com/alacritty/alacritty/releases/latest",
    );
  },
  mempalace: async () => {
    if (await commandExists("mempalace")) return;
    log.info("Installing mempalace (local-first AI memory)...");
    // --native-tls: trusts the OS cert store too, not just uv's bundled
    // one — required behind a corporate TLS-inspecting proxy, harmless
    // elsewhere. Chained in one shell so a freshly-installed uv (not yet
    // on this process's PATH) is still visible to the tool-install step.
    await run([
      "bash",
      "-c",
      `command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
       export PATH="$HOME/.local/bin:$PATH"
       uv tool install --native-tls mempalace`,
    ]);
  },
};

// Install a Windows app on the host from inside WSL via winget. Best-effort:
// with interop off there is no winget.exe to call, so warn and point at the
// installer rather than failing the whole package step.
async function installOnWindowsHost(name: string, wingetId: string, manualUrl: string) {
  try {
    const listed = await runQuiet(["winget.exe", "list", "--exact", "--id", wingetId]);
    if (listed.includes(wingetId)) {
      log.success(`${name} already installed on the Windows host`);
      return;
    }
  } catch {
    // winget exits non-zero both when the package is missing and when interop
    // is off — fall through and let the install attempt say which it was.
  }

  log.info(`Installing ${name} on the Windows host (winget)...`);
  try {
    await run([
      "winget.exe",
      "install",
      "--exact",
      "--id",
      wingetId,
      "--accept-package-agreements",
      "--accept-source-agreements",
    ]);
    log.success(`${name} installed on the Windows host`);
  } catch {
    log.warning(`Could not reach winget from WSL; install ${name} on Windows manually: ${manualUrl}`);
  }
}

// Per-user font install on the Windows host. Copying into the user font dir
// and writing the HKCU registry entry is not enough on its own: Windows only
// loads those at sign-in, so a running session (and every Alacritty launched
// from it) reports the font as missing. AddFontResourceW + WM_FONTCHANGE loads
// them now. Files already present are skipped, since a loaded font is locked
// and overwriting it fails.
const WINDOWS_FONT_INSTALL_PS = `
$ErrorActionPreference = 'Stop'
$dst = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Fonts'
New-Item -ItemType Directory -Force $dst | Out-Null
$reg = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
Add-Type -Namespace Dotfiles -Name Fonts -MemberDefinition @'
[DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceW(string f);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeoutW(IntPtr h, uint m, IntPtr w, IntPtr l, uint fl, uint t, out IntPtr r);
'@
$files = @(Get-ChildItem $src -Filter 'FiraCodeNerdFontMono-*.ttf')
if ($files.Count -eq 0) { throw "no FiraCodeNerdFontMono-*.ttf in $src" }
foreach ($f in $files) {
  $target = Join-Path $dst $f.Name
  if (-not (Test-Path $target)) { Copy-Item $f.FullName $target }
  $name = ($f.BaseName -replace '^FiraCodeNerdFontMono-', 'FiraCode Nerd Font Mono ') + ' (TrueType)'
  New-ItemProperty -Path $reg -Name $name -Value $target -PropertyType String -Force | Out-Null
  [void][Dotfiles.Fonts]::AddFontResourceW($target)
}
$r = [IntPtr]::Zero
[void][Dotfiles.Fonts]::SendMessageTimeoutW([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 5000, [ref]$r)
`;

// Windows Alacritty renders with Windows fonts, so the Nerd Font installed
// into WSL is invisible to it. Mirror the Mono variant onto the host.
async function installWindowsFonts(linuxFontDir: string) {
  log.info("Installing FiraCode Nerd Font on the Windows host...");
  try {
    const winSrc = await runQuiet(["wslpath", "-w", linuxFontDir]);
    const script = `$src = '${winSrc.replace(/'/g, "''")}'\n${WINDOWS_FONT_INSTALL_PS}`;
    // -EncodedCommand (UTF-16LE base64) sidesteps quoting across the interop boundary.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    await runQuiet(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
    log.success("FiraCode Nerd Font installed on the Windows host");
  } catch (err) {
    log.warning(`Could not install FiraCode Nerd Font on Windows: ${err}`);
  }
}

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

// Run special installers only (idempotent — skips already-installed tools)
export async function installSpecialPackages() {
  const specialPackages = Object.keys(LINUX_SPECIAL_INSTALL);
  for (const pkg of specialPackages) {
    await LINUX_SPECIAL_INSTALL[pkg]();
  }
}

// Tools installed the same way on both platforms (bun / uv, not brew or apt).
// Both setup and sync call this, so a Mac sync doesn't silently skip them.
export async function installCrossPlatformTools() {
  await LINUX_SPECIAL_INSTALL.pi();
  await LINUX_SPECIAL_INSTALL.mempalace();
  await installMempalacePiPackage();
}

// Pi ships no MCP client on purpose, so mempalace reaches pi through this
// package: it bridges the mempalace-mcp stdio server into pi tools and runs the
// save/precompact policy on pi's native events instead of shelling out to
// `mempalace hook run --harness`, which only knows claude-code and codex.
//
// Pinned deliberately. Pi packages execute with full agent privileges, so a
// version bump deserves a source re-read (0.2.8 audited: no deps, no install
// scripts, no network, npm tarball identical to the git tag). Bump with
// `pi update npm:mempalace-pi` after reviewing, not silently on a new machine.
const MEMPALACE_PI_PACKAGE = "npm:mempalace-pi@0.2.8";

async function installMempalacePiPackage() {
  if (!(await commandExists("pi"))) return;

  try {
    const installed = await runQuiet(["pi", "list"]);
    if (installed.includes("mempalace-pi")) return;
  } catch {
    // A pi too old for `list`, or an unreadable settings file — try the install
    // and let pi itself report the real problem.
  }

  log.info("Installing mempalace pi package...");
  try {
    await run(["pi", "install", MEMPALACE_PI_PACKAGE]);
  } catch {
    log.warning(`Could not install ${MEMPALACE_PI_PACKAGE} — install manually with: pi install ${MEMPALACE_PI_PACKAGE}`);
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
  await installSpecialPackages();
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
    return;
  }

  if (isWSL()) {
    await installWindowsFonts(`${fontDir}/FiraCode`);
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
      await run(["bash", "-c", `$HOME/.bun/bin/bun install -g @vtsls/language-server typescript vscode-langservers-extracted @fsouza/prettierd tree-sitter-cli`]);
    } catch {
      log.warning("Failed to install some LSP tools via bun");
    }
  }

  await installCrossPlatformTools();

  // Post-install: git-lfs
  if (await commandExists("git-lfs")) {
    await run(["git", "lfs", "install"]);
    log.success("Git LFS initialized");
  }

  log.success("Package installation complete");
}
