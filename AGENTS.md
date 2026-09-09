# Dotfiles — Agent Instructions

Cross-platform dotfiles for **macOS** and **Ubuntu/WSL2**. Every change you make must work on both platforms. If it's platform-specific, gate it explicitly — don't silently break the other side.

## Architecture

```
dotfiles/
├── bootstrap.sh          # installs bun, then hands off to setup.ts
├── install.sh            # one-liner entry point (curl | bash)
├── setup.ts              # interactive first-run orchestrator
├── sync.ts               # idempotent sync (packages + symlinks + theme regen)
├── src/                  # setup modules (see below)
├── themes/               # theme JSON definitions + active.txt
├── fish/                 # fish shell config + functions (symlinked as directory)
├── nvim/                 # neovim config (symlinked as directory)
├── tmux/                 # tmux.conf.tmpl + generated tmux.conf
├── git/                  # .gitconfig + .gitignore_global
├── alacritty/            # alacritty template fragments + generated outputs
├── lazygit/              # config.yml.tmpl + generated config.yml
├── bat/                  # themes dir (symlinked)
├── claude/               # global agent instructions + Claude Code defaults (see below)
├── pi/                   # Pi keybindings/extensions/agents defaults (copy-once)
└── docs/specs/           # decision specs from past sessions
```

**Orchestration is Bun + TypeScript.** Shell scripts (`bootstrap.sh`, `install.sh`) are kept minimal — all real logic lives in `src/`. Don't add logic to shell scripts.

### `src/` modules

| File | Responsibility |
|---|---|
| `platform.ts` | `detectPlatform()` → `"macos" \| "linux"`, `isWSL()` |
| `packages.ts` | `installPackages()`, apt package list, special Linux installers |
| `symlinks.ts` | `setupSymlinks()` — defines and creates live symlinks |
| `ai-harness.ts` | `setupAiHarnessConfig()` — copy-once Claude/Pi harness defaults and symlink migration |
| `fish.ts` | Sets fish as default shell |
| `git.ts` | `ensureGitconfigLocal()`, `ensureGitconfigPersonal()` |
| `keys.ts` | GPG/SSH key setup |
| `macos.ts` | `applyMacOSDefaults()`, `configureDock()` — macOS only |
| `theme.ts` | Template rendering, theme switching, Windows Alacritty mirror |
| `utils.ts` | `log`, `run()`, `runQuiet()`, `DOTFILES_DIR` |

## Platform handling

- **Detection:** `detectPlatform()` returns `"macos"` or `"linux"`. WSL reports as `"linux"` — use `isWSL()` separately when WSL-specific behavior is needed.
- **Packages:** Homebrew (`Brewfile`) on macOS; apt + special installers on Linux.
- **macOS-only features:** `applyMacOSDefaults()` and `configureDock()` in `src/macos.ts`, gated in `setup.ts` behind `platform === "macos"`.
- **Machine-specific overrides** go in local files (gitignored): `~/.config/fish/config.local.fish`, `~/.config/fish/aliases.local.fish`, `~/.gitconfig.local`.

## Template files (theming)

The theme engine renders `{{var}}` placeholders from a theme JSON into output config files. **The `.tmpl` files are the source of truth — never edit generated outputs directly.**

| Template | Generated output |
|---|---|
| `alacritty/alacritty.toml.tmpl` | `alacritty/alacritty.toml` |
| `alacritty/colors.toml.tmpl` | `alacritty/colors.toml` |
| `alacritty/common.toml.tmpl` | `alacritty/common.toml` |
| `alacritty/windows.toml.tmpl` | `alacritty/windows.toml` |
| `tmux/tmux.conf.tmpl` | `tmux/tmux.conf` |
| `nvim/lua/options.lua.tmpl` | `nvim/lua/options.lua` |
| `nvim/lua/plugins/scrollbar.lua.tmpl` | `nvim/lua/plugins/scrollbar.lua` |
| `lazygit/config.yml.tmpl` | `lazygit/config.yml` |

Generated outputs are gitignored and materialized by running `generateConfigs()` (called by both `setup.ts` and `sync.ts`). Theme definitions live in `themes/<slug>.json`; the active theme is recorded in `themes/active.txt`.

`{{filename}}` is a lazygit-internal placeholder — `render()` skips it intentionally.

## Symlink map

`src/symlinks.ts` → `setupSymlinks()` creates all live symlinks below. If you're adding a config that should stay live-linked, add the symlink entry there, not ad-hoc. AI harness runtime config is the exception: use `src/ai-harness.ts` because those files intentionally diverge by machine.

| Source (in repo) | Target (on machine) |
|---|---|
| `fish/config.fish` | `~/.config/fish/config.fish` |
| `fish/aliases.fish` | `~/.config/fish/aliases.fish` |
| `fish/fish_plugins` | `~/.config/fish/fish_plugins` |
| `fish/functions/` | `~/.config/fish/functions/` (entire dir) |
| `fish/conf.d/nvm_auto_init.fish` | `~/.config/fish/conf.d/nvm_auto_init.fish` |
| `fish/completions/theme.fish` | `~/.config/fish/completions/theme.fish` |
| `git/.gitconfig` | `~/.gitconfig` |
| `git/.gitignore_global` | `~/.gitignore_global` |
| `alacritty/alacritty.toml` | `~/.config/alacritty/alacritty.toml` |
| `nvim/` | `~/.config/nvim/` (entire dir) |
| `tmux/tmux.conf` | `~/.tmux.conf` |
| `lazygit/config.yml` | `~/Library/Application Support/lazygit/config.yml` (macOS) or `~/.config/lazygit/config.yml` (Linux) |
| `bat/themes/` | `~/.config/bat/themes/` |
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `claude/CLAUDE.md` | `~/.pi/agent/AGENTS.md` |
| `pi/APPEND_SYSTEM.md` | `~/.pi/agent/APPEND_SYSTEM.md` |

**Fish functions dir is symlinked as a whole** — `funcsave` writes directly into `fish/functions/`, which lands in the repo automatically. Fisher-managed functions are gitignored and auto-installed from `fish_plugins` on first shell launch.

## Git identity and GitHub account routing

Two identities coexist on a work machine, routed by directory. `git/.gitconfig` includes them in this order — **last include wins**, so the order is load-bearing:

| Config (gitignored, machine-local) | Applies to | Signing |
|---|---|---|
| `~/.gitconfig.local` | everything (default identity) | GPG |
| `~/.gitconfig.personal` | `gitdir:~/dotfiles/` and `gitdir:~/personal/` | SSH |

Clone personal repos into `~/personal/` and they inherit the personal identity automatically. `src/git.ts` creates that directory unconditionally, since the `includeIf` refers to it.

### Do not "fix" the https rewrite

```
[url "https://github.com/"]
	insteadOf = git@github.com:
```

This line looks redundant next to the SSH keys in `~/.ssh/`, and it is **not**. Some corporate networks block SSH to GitHub outright — `github.com:22` refuses and the usual `ssh.github.com:443` fallback resets — so HTTPS is the only working transport. Removing the rewrite breaks every clone and push on those machines.

**SSH keys here are for signing and identity, not transport.** A personal SSH *signing* key works fine on such networks because signing is a local operation that never touches the network.

### Why push routing names the account explicitly

`gh auth git-credential` only ever answers for gh's **globally active** account; asking it for any other username returns nothing. A `credential.username` hint therefore cannot route between two accounts. So each identity config carries its own credential helper that names its account and pulls that account's token from gh's keyring:

```
[credential "https://github.com"]
	helper =                      # empty value resets the inherited helper list
	helper = !f() { ... gh auth token --hostname github.com --user <acct> ... }; f
```

The empty `helper =` first is required — without it the helper inherited from `git/.gitconfig` still answers first. The payoff is that push identity is independent of `gh auth switch`.

### Signing keys must match the author email

GitHub marks a commit **Unverified** when the signing key's UID doesn't match the author email. `selectGpgKey()` in `src/git.ts` therefore filters candidate GPG keys by email and refuses to silently auto-select a mismatched key — auto-picking "the only key on the machine" is exactly how a work key ends up signing personal commits.

### Migration on existing machines

`ensureGitconfigLocal()` / `ensureGitconfigPersonal()` skip machines that already have an identity, so `ensureCredentialRouting()` backfills push routing separately on `bun run sync.ts`. It adds only the credential block, never touching name/email/signing, and no-ops when gh has fewer than two accounts (a single account is unambiguous, so there's nothing to route).

## The `claude/` directory

`claude/CLAUDE.md` contains **global** agent instructions (Brandon's identity, communication style, git safety rules). It's symlinked to `~/.claude/CLAUDE.md` and `~/.pi/agent/AGENTS.md` so it applies to every agent session across all projects.

This file (`AGENTS.md` in the repo root) is **project-level** context — specific to working in this repo. Don't conflate the two:

- Edit `claude/CLAUDE.md` for global identity/style/safety rules.
- Edit `AGENTS.md` (this file) for dotfiles-specific instructions.

`claude/settings.json` holds shared Claude Code settings (copied, not symlinked, on first setup — it's a template).

## AI harness defaults

Claude/Pi runtime config is copy-once because company and personal machines legitimately diverge. `src/ai-harness.ts` seeds these files and migrates old symlinks by backing up the current symlink-resolved contents, removing the symlink, and restoring the current state as a real file/dir:

| Source default | Target on machine |
|---|---|
| `claude/settings.json` | `~/.claude/settings.json` |
| `pi/keybindings.json` | `~/.pi/agent/keybindings.json` |
| `pi/extensions/` | `~/.pi/agent/extensions/` |
| `pi/agents/` | `~/.pi/agent/agents/` |

Run `bun run ai-setup` to seed/migrate without overwriting existing local config. Run `bun run ai-setup -- --force` to review diffs and selectively reset local files from dotfiles defaults. Backups go under `~/.config/dotfiles/backups/ai-harness/`.

New Pi agents/extensions are machine-local by default via `pi/agents/.gitignore` and `pi/extensions/.gitignore`. To share one across machines, add an explicit allowlist entry in the relevant `.gitignore` and commit the file. Generated repo-specific nudges/hooks do **not** belong in dotfiles.

## WSL-specific quirks

These will bite you if you forget them:

- **npm `bin-links` must be `false`** — WSL2 can't create symlinks in `/mnt/c` filesystems; npm blows up creating bin links.
- **Mason can't install npm-based LSP tools** — use `bun install -g` instead. The packages module does this automatically in `installPackages()` on Linux.
- **`tree-sitter-cli` requires Node** — install via bun, but needs `nvm install lts` first since bun shells don't inherit nvm's node.
- **`~/.local/bin` must be explicit in fish PATH** — tmux panes don't inherit the parent's PATH; lazygit, delta, etc. live in `~/.local/bin` on Linux and won't be found otherwise.
- **Windows Alacritty** runs as a native Windows process and reads `%APPDATA%\alacritty\alacritty.toml`, not the WSL symlink. `generateConfigs()` mirrors rendered fragments there via `wslpath` + `cmd.exe` when `isWSL()` is true. If interop is off, it warns and skips — it never breaks a sync.

## Package installation strategy

| Platform | Tool | Source of truth |
|---|---|---|
| macOS | Homebrew | `Brewfile` |
| Linux/WSL | apt | `LINUX_APT_PACKAGES` array in `src/packages.ts` |
| Linux/WSL (special) | custom installers | `LINUX_SPECIAL_INSTALL` map in `src/packages.ts` |
| Linux/WSL (LSP tools) | `bun install -g` | hardcoded list in `installPackages()` |

Special installers in `LINUX_SPECIAL_INSTALL` are idempotent — they check `commandExists()` first and skip if already installed. When adding a new tool that's in apt, add it to `LINUX_APT_PACKAGES`. If it needs a custom install, add an entry to `LINUX_SPECIAL_INSTALL`. Add macOS tools to `Brewfile`.

## Neovim

- Config uses **nvim 0.12+ APIs** (`vim.lsp.config`, `vim.lsp.enable`) — don't use the deprecated `require("lspconfig")` setup pattern.
- Plugin manager: lazy.nvim (auto-installs on first launch).
- **macOS:** Mason installs LSP servers.
- **Linux/WSL:** Mason's npm integration breaks — LSP tools are installed via `bun install -g` at setup time.
- Theme: Tokyo Night, driven by the template engine. `nvim/lua/theme-active.lua` is generated — don't edit it directly.

## Development workflow

- **Test setup changes:** `bun run setup.ts` (interactive) or `bun run sync.ts` (non-interactive sync).
- **Test theme changes:** `theme <slug>` in fish (calls `src/theme.ts` via the fish function).
- **Adding a new config file:** create the file in the repo, add a symlink entry in `src/symlinks.ts`, run `bun run sync.ts`.
- **Adding a new template:** create the `.tmpl` file, add it to the `TEMPLATES` array in `src/theme.ts`, run `bun run sync.ts`.
- **Drift detection** runs once per day via `dotfiles_check.fish` on shell startup — warns about uncommitted changes or remote drift.

## Key conventions

- **Platform gates belong in TypeScript**, not shell. `isWSL()` and `detectPlatform()` are your tools.
- **Inspect before editing.** Read the relevant source files before making changes.
- **Precise edits.** Don't rewrite files wholesale when a targeted change works.
- **Don't commit unless asked.**
- **Never `git push` without confirmation.**
- **No `Co-authored-by` trailers** on commits.
