# Dotfiles

Cross-platform dotfiles for **macOS** and **Ubuntu/WSL**. All changes must work on both platforms.

## Architecture

- **Bun + TypeScript** — setup logic lives in `src/`, orchestrated by `setup.ts`
- **bootstrap.sh** — minimal shell shim that installs Bun, then hands off to TypeScript
- **install.sh** — one-liner entry point (clones repo + runs bootstrap)
- Config files (fish, git, alacritty, nvim, tmux) are symlinked into place, not copied

## Platform handling

- OS detection: `src/platform.ts` (`detectPlatform()`, `isWSL()`)
- Packages: Homebrew on macOS, apt on Linux (`src/packages.ts`)
- macOS-only features (defaults, dock) are gated in `setup.ts` and live in `src/macos.ts`
- Config files handle platform differences at runtime (e.g., `uname` checks in fish)
- Machine-specific overrides go in `*.local.fish` files and `~/.gitconfig.local` (gitignored)

## Template files (source of truth for theming)

The following `.tmpl` files are the source of truth — their generated counterparts are overwritten by the theme engine. Always edit the `.tmpl`, never the output file directly:

- `alacritty/alacritty.toml.tmpl` → `alacritty/alacritty.toml`
- `lazygit/config.yml.tmpl` → `lazygit/config.yml`
- `nvim/lua/options.lua.tmpl` → `nvim/lua/options.lua`
- `nvim/lua/plugins/scrollbar.lua.tmpl` → `nvim/lua/plugins/scrollbar.lua`
- `tmux/tmux.conf.tmpl` → `tmux/tmux.conf`

## Key conventions

- Shell scripts should be kept minimal — logic belongs in TypeScript
- `funcsave` writes directly to `~/dotfiles/fish/functions/` (directory symlink)
- Drift detection runs once per day on shell startup via `dotfiles_check.fish`
- Fisher-managed functions are gitignored (auto-installed from `fish_plugins`)

## Neovim

- Config uses nvim 0.12+ APIs (`vim.lsp.config`, `vim.lsp.enable`)
- Plugin manager: lazy.nvim (auto-installs on first launch)
- LSP servers: Mason installs on macOS; bun globals on Linux/WSL (npm symlinks break on WSL)
- Theme: Tokyo Night (matched across alacritty, nvim, tmux)

## Known WSL quirks

- npm `bin-links` must be `false` (symlink permission errors in WSL2)
- Mason can't install npm-based tools — use `bun install -g` instead
- tree-sitter-cli installed via bun, requires node (use `nvm install lts`)
- `~/.local/bin` must be explicitly in fish PATH (not inherited in tmux panes)
