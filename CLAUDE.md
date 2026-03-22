# Dotfiles

Cross-platform dotfiles for **macOS** and **Ubuntu/WSL**. All changes must work on both platforms.

## Architecture

- **Bun + TypeScript** — setup logic lives in `src/`, orchestrated by `setup.ts`
- **bootstrap.sh** — minimal shell shim that installs Bun, then hands off to TypeScript
- **install.sh** — one-liner entry point (clones repo + runs bootstrap)
- Config files (fish, git, alacritty) are symlinked into place, not copied

## Platform handling

- OS detection: `src/platform.ts` (`detectPlatform()`, `isWSL()`)
- Packages: Homebrew on macOS, apt on Linux (`src/packages.ts`)
- macOS-only features (defaults, dock) are gated in `setup.ts` and live in `src/macos.ts`
- Config files handle platform differences at runtime (e.g., `uname` checks in fish)
- Machine-specific overrides go in `*.local.fish` files (gitignored)

## Key conventions

- Shell scripts should be kept minimal — logic belongs in TypeScript
- `funcsave` writes directly to `~/dotfiles/fish/functions/` (directory symlink)
- Drift detection runs once per day on shell startup via `dotfiles_check.fish`
