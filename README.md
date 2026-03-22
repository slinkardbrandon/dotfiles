# Dotfiles

Cross-platform dotfiles for **macOS** and **Ubuntu/WSL**.

## Quick Install

```bash
# One-liner (clones repo + runs setup)
curl -fsSL https://raw.githubusercontent.com/slinkardbrandon/dotfiles/main/install.sh | bash

# Or manually
git clone https://github.com/slinkardbrandon/dotfiles.git ~/dotfiles
bash ~/dotfiles/bootstrap.sh
```

The setup is interactive — it prompts for each step (packages, symlinks, shell, keys).

## What's Included

### Shell & Terminal
- **Fish Shell** with Starship prompt, Fisher plugin manager
- **Alacritty** terminal config (Tokyo Night theme, FiraCode Nerd Font)
- **Tmux** with `Ctrl+a` prefix, vim-style pane navigation, Tokyo Night status bar

### Editor
- **Neovim** with custom Lua config:
  - Telescope (fuzzy finder — `Space f` / `Space p`)
  - LSP: TypeScript, ESLint, Go, Lua (auto-complete, go-to-definition, etc.)
  - Prettier format-on-save (only when prettier config detected)
  - DAP debugging with Jest/Vitest single-test support
  - Neo-tree file explorer, gitsigns, bufferline, which-key
  - Tokyo Night theme

### Git
- Aliases, pull rebase, auto-setup remote
- GPG commit signing (key stored in `~/.gitconfig.local`)
- Global gitignore

### Packages (auto-installed)
ripgrep, fd, bat, eza, fzf, jq, tree, htop, gh, git-lfs, go, tmux, neovim

**macOS extras:** Homebrew casks (Chrome, Rectangle, 1Password, VS Code, Obsidian), macOS defaults, Dock cleanup

## How It Works

The setup is **Bun + TypeScript** — `bootstrap.sh` installs Bun, then everything runs through `setup.ts`.

```
dotfiles/
├── bootstrap.sh          # installs bun, runs setup.ts
├── setup.ts              # interactive orchestrator
├── src/                  # setup modules (packages, symlinks, fish, keys, macos)
├── fish/                 # shell config + functions (symlinked)
├── nvim/                 # neovim config (symlinked as directory)
├── tmux/                 # tmux.conf (symlinked)
├── git/                  # .gitconfig + .gitignore_global (symlinked)
├── alacritty/            # alacritty.toml (symlinked)
└── claude/               # claude code settings (symlinked)
```

All configs are **symlinked**, not copied — edit in `~/dotfiles/`, changes take effect immediately.

## Machine-Specific Config

Shared config lives in the repo. Machine-specific stuff goes in local override files (gitignored):

| What | File |
|---|---|
| Fish config | `~/.config/fish/config.local.fish` |
| Fish aliases | `~/.config/fish/aliases.local.fish` |
| Git (GPG key, etc.) | `~/.gitconfig.local` |

## Keeping In Sync

A drift checker runs once per day when you open a terminal:
- Warns about uncommitted changes in `~/dotfiles/`
- Warns if you're behind or ahead of remote

New fish functions created via `funcsave` automatically land in the repo (the functions directory is symlinked).

## Key Bindings

### Neovim
| Key | Action |
|---|---|
| `Space f` / `Space p` | Find files |
| `Space P` | Command palette |
| `Space sg` | Search grep across files |
| `Space e` | File explorer |
| `gd` / `gr` / `gi` | Go to definition / references / implementation |
| `K` | Hover docs |
| `Space ca` | Code action |
| `Space rn` | Rename symbol |
| `Space cf` | Format file |
| `Space db` | Toggle breakpoint |
| `Space dc` | Debug continue/start |
| `Space gb` | Git blame line |

### Tmux
| Key | Action |
|---|---|
| `Ctrl+a c` | New window |
| `Ctrl+a \|` | Split right |
| `Ctrl+a -` | Split down |
| `Ctrl+a h/j/k/l` | Navigate panes |
| `Alt+1-5` | Switch window |
| `Ctrl+a d` | Detach |
| `Ctrl+a r` | Reload config |
