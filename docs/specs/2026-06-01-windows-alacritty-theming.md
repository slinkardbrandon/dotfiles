# Windows Alacritty Theming via the Dotfiles Theme Engine

> Spec session — 2026-06-01

## Summary

Windows Alacritty (`Alacritty.exe`, running via WSL) ignores the dotfiles theme
engine because it reads its own host config at `%APPDATA%\alacritty\alacritty.toml`,
not the WSL-side symlinked config the theme engine generates. This splits the
monolithic `alacritty.toml.tmpl` into shared fragments wired with Alacritty
`import`, and teaches `generateConfigs()` to mirror the rendered fragments into
`%APPDATA%` whenever it runs on WSL. Net result: `theme <x>` re-themes both the
unix and Windows terminals, nothing is maintained twice, and the macOS path is
byte-identical to today.

## Key Decisions

- **Windows wiring lives inside `generateConfigs()`, gated by `isWSL()` — not a
  one-time setup.ts step.** Colors must re-propagate to `%APPDATA%` on every
  `theme` switch and every sync. `setup.ts` and `sync.ts` already call
  `generateConfigs()`, so first-time setup rides the same code path with no
  special-casing.
- **No PowerShell script in scope.** The user installs WSL + Alacritty manually
  via PowerShell on a fresh machine; that stays manual. Everything dotfiles-
  related — including the entire Windows Alacritty config (launcher + theme) —
  is written from WSL via `/mnt/c`. The previously-existing one-off
  `1-windows-setup.ps1` (a Claude session artifact, never in the repo) is
  abandoned, not modified.
- **All four pieces stay `.tmpl` → gitignored output.** The repo convention is
  that only `.tmpl` files are tracked and their rendered outputs are gitignored.
  Generated outputs don't exist on a fresh clone until `generateConfigs()` runs,
  so the shims and `common` fragment must be generated (not static-tracked) to
  materialize at all. `common.toml.tmpl` and the shims have no `{{}}` vars, so
  `render()` is a harmless no-op for them.
- **`import` goes under `[general]`** — installed Alacritty is **0.17.0**, where
  top-level `import` is deprecated.
- **Import path strategy:** the unix shim uses tilde-absolute paths
  (`~/dotfiles/alacritty/...`), which expand on both macOS and Linux and sidestep
  any ambiguity over whether Alacritty resolves relative imports against the
  symlink location or its target. The windows shim uses relative sibling paths
  (`common.toml`, `colors.toml`) because all three files are real siblings in
  `%APPDATA%\alacritty\` (no symlink there).
- **AppData path resolved live** via `wslpath -u "$(cmd.exe /c 'echo %APPDATA%')"`
  (strip the trailing CR) — no hardcoded username, survives OneDrive-redirected
  profiles. On interop failure (`cmd.exe` unavailable), warn and skip the Windows
  mirror; never break the sync.
- **No reload step needed** — Alacritty's `live_config_reload` is on by default,
  so rewriting the `%APPDATA%` files makes a running Windows Alacritty re-theme
  itself.
- **`option_as_alt` / `blur`** stay in the unix shim — macOS-tuned keys already
  silently ignored on Linux today, so no regression.

## Terms Clarified

- **Unix shim**: the `alacritty.toml` consumed by both macOS and Linux GUI
  Alacritty (the existing `~/.config/alacritty/alacritty.toml` symlink target).
  Holds the `[window]` block + imports. _Avoid_: calling this "the Linux config" —
  macOS and Linux share it.
- **Windows shim**: `windows.toml` rendered in the repo, copied to
  `%APPDATA%\alacritty\alacritty.toml`. Holds the `wsl.exe` launcher + Windows
  `[window]` bits + imports. The only file carrying platform-specific launcher
  config.
- **Fragments**: `colors.toml` (theme-driven) and `common.toml` (static font +
  keybinds) — imported by both shims, generated once, written to both
  filesystems as identical bytes.

## Test Cases

- macOS effective config is byte-identical — merge the unix shim + `common` +
  `colors` and diff against today's single `alacritty.toml`; same window, font,
  colors, keybinds.
- `theme nord` rewrites `%APPDATA%/alacritty/colors.toml` to Nord's palette, and
  it matches the WSL-side `colors.toml` byte-for-byte.
- A non-WSL Linux run of `generateConfigs()` writes only `~/dotfiles/alacritty/`
  and never touches `/mnt/c`.
- Re-running sync is idempotent — copying fragments to AppData twice yields the
  same files, no dupes or errors.
- Interop-off / `cmd.exe` failure → `generateConfigs()` warns and skips the
  Windows mirror; the rest of sync completes.

## Implementation Plan

### Files to touch

- `alacritty/colors.toml.tmpl` — **new.** The `[colors.*]` block +
  `draw_bold_text_with_bright_colors`, moved verbatim out of the old template
  (keeps all `{{colors.*}}` placeholders).
- `alacritty/common.toml.tmpl` — **new.** `[font]` block + the three
  `[[keyboard.bindings]]` (Shift+Return, Super+\`, Ctrl+\`). No vars.
- `alacritty/alacritty.toml.tmpl` — **slimmed (unix shim).** Becomes:
  ```toml
  [general]
  import = ["~/dotfiles/alacritty/common.toml", "~/dotfiles/alacritty/colors.toml"]

  [window]
  option_as_alt = "Both"
  opacity = 0.95
  blur = true
  ```
- `alacritty/windows.toml.tmpl` — **new (windows shim).** Becomes:
  ```toml
  [general]
  import = ["common.toml", "colors.toml"]

  [terminal.shell]
  program = "wsl.exe"
  args = ["~", "-d", "Ubuntu"]

  [window]
  opacity = 0.97
  padding = { x = 8, y = 8 }
  dynamic_title = true

  [scrolling]
  history = 10000
  ```
- `src/theme.ts`:
  - Add three entries to `TEMPLATES` (`colors.toml.tmpl`→`colors.toml`,
    `common.toml.tmpl`→`common.toml`, `windows.toml.tmpl`→`windows.toml`);
    the existing alacritty entry stays (now renders the slimmed unix shim).
  - Import `isWSL` from `./platform`.
  - At the end of `generateConfigs()`, call a new `mirrorToWindows()` helper:
    if `isWSL()`, resolve the AppData alacritty dir, `mkdir -p` it, then copy
    `windows.toml`→`alacritty.toml`, `common.toml`→`common.toml`,
    `colors.toml`→`colors.toml`. Wrap in try/catch → `log.warning` on failure,
    don't throw.
  - AppData resolver: `runQuiet(["cmd.exe", "/c", "echo %APPDATA%"])`, strip
    `\r`, `runQuiet(["wslpath", "-u", clean])`, `join(result, "alacritty")`.
- `.gitignore` — add `alacritty/colors.toml`, `alacritty/common.toml`,
  `alacritty/windows.toml` under the existing "Theme engine — generated configs"
  section.
- `README.md` — one line under Windows/WSL setup: on a fresh machine, first
  enter WSL via the Ubuntu app (not Alacritty), run `bun setup`, *then* open
  Alacritty (the launcher config doesn't exist until setup writes it).
- **No change:** `src/symlinks.ts` (unix shim keeps the `alacritty.toml` name,
  existing symlink still correct), `src/platform.ts` (`isWSL` already exists),
  `setup.ts`, `sync.ts` (both already call `generateConfigs`).

### Patterns to follow

- `TEMPLATES` array + `render()` no-op-on-no-vars pattern in `src/theme.ts`.
- `isWSL()` gating as used in `setup.ts`.
- `runQuiet()` / `Bun.write` / `log.success`/`log.warning` from `src/utils.ts`.
- gitignore convention: track `.tmpl`, ignore rendered output.

### How to verify

- Run `theme` (no args regenerates) → confirm `~/dotfiles/alacritty/` has
  `alacritty.toml`, `common.toml`, `colors.toml`, `windows.toml`, and
  `%APPDATA%/alacritty/` has `alacritty.toml`, `common.toml`, `colors.toml`.
- Open Windows Alacritty → themed colors + lands in Ubuntu.
- `theme nord` → `theme tokyo-night` → Windows colors follow live.
- Sanity that macOS merged config equals the pre-change single file.

### Assumptions

- WSL interop is enabled (default) so `cmd.exe` + `wslpath` resolve AppData;
  otherwise the mirror is skipped with a warning.
- Distro stays `Ubuntu` for the launcher args (matches the current config).
