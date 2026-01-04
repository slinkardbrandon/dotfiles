# 🏠 Dotfiles

My personal macOS dotfiles with automated setup for a new machine.

## ⚡️ Quick Install

Run this one-liner to set up a new machine:

```bash
curl -fsSL https://raw.githubusercontent.com/slinkardbrandon/dotfiles/main/install.sh | bash
```

## 🎯 What's Included

- **Fish Shell**: Fast, modern shell with sensible defaults
- **Git Configuration**: Pre-configured with common aliases and settings
- **macOS Defaults**: Optimized system preferences
- **Custom Functions**: Useful utilities for daily development
- **Homebrew Packages**: Essential development tools
- **Fisher Plugins**: nvm.fish and z (directory jumper)
- **Alacritty Terminal**: Pre-configured with Nord theme and FiraCode Nerd Font
- **Rectangle**: Window management tool
- **Chrome**: Set as default browser

### Applications Installed via Homebrew

The setup will automatically install:
- **Google Chrome** (and set as default browser)
- **Alacritty** (terminal with custom config)
- **Rectangle** (window management)
- **FiraCode Nerd Font** (for terminal)

### Applications to Install Manually

You'll need to download and install these separately:
- **1Password** - Password manager
- **VS Code** - Code editor
- **Obsidian** - Note-taking app

## 📦 Features

### Fish Shell Configuration

- **Starship Prompt**: Beautiful, fast, customizable prompt
- **NVM Integration**: Node version management via nvm.fish
- **Z Directory Jumper**: Quick navigation to frequent directories
- **Path Setup**: Homebrew, Cargo, Bun, and more
- **Custom Aliases**: Minimal, essential shortcuts

### Git Aliases

- `g` → `git`
- `ga` → `git add`
- `gc` → `git commit`
- `gp` → `git push`

### Custom Fish Functions

- **`commit`** - Git commit with optional timestamp manipulation
  ```bash
  commit "feat: add feature"          # Normal commit
  commit "fix: bug fix" -30m          # 30 minutes in the past
  commit "feat: new thing" 5h         # 5 hours in the future
  ```

- **`killport`** - Kill process running on a specific port
  ```bash
  killport 3000
  ```

- **`dprune`** - Clean up Docker containers, images, and networks
  ```bash
  dprune
  ```

- **`dnuke`** - Nuclear option: remove ALL Docker data
  ```bash
  dnuke
  ```

- **`mkcd`** - Create directory and cd into it
  ```bash
  mkcd ~/projects/new-project
  ```

- **`extract`** - Extract any archive format
  ```bash
  extract archive.tar.gz
  ```

- **`z`** - Jump to frequently used directories (via Fisher plugin)
  ```bash
  z documents  # Jump to ~/Documents
  z proj       # Jump to ~/projects/my-project
  ```

### macOS Defaults

The setup configures sensible macOS defaults including:

- **UI/UX**: Dark mode enabled, no boot sound
- **Finder**: Show hidden files, extensions, path bar, status bar
- **Keyboard**: Fast key repeat rate (KeyRepeat=2, InitialKeyRepeat=11), press-and-hold disabled
- **Trackpad**: Tap to click enabled
- **Screenshots**: Selection tool by default, save to Desktop in PNG
- **Dock**: Auto-hide, small size (48px), faster animations
- **Security**: Require password immediately after sleep
- **Performance**: Disable animations where possible
- **Hot Corners**: Bottom-right for Quick Note

### Development Tools

Installed via Homebrew:
- **Languages**: Go
- **Git Tools**: git-lfs, gpg, gnupg, pinentry-mac
- **CLI Utilities**: curl, wget, jq, tree, htop, ripgrep, fd, bat, exa, fzf
- **macOS Tools**: defaultbrowser

## 📁 Structure

```
dotfiles/
├── install.sh              # Main installation script
├── bootstrap.sh            # Xcode CLI Tools & Homebrew
├── macos/
│   └── defaults.sh        # macOS system preferences
├── fish/
│   ├── config.fish        # Main fish configuration
│   ├── aliases.fish       # Shell aliases
│   ├── fish_plugins       # Fisher plugin list
│   └── functions/         # Custom fish functions
│       ├── commit.fish
│       ├── killport.fish
│       ├── dprune.fish
│       ├── dnuke.fish
│       ├── mkcd.fish
│       └── extract.fish
├── git/
│   └── .gitconfig         # Git configuration
├── alacritty/
│   └── alacritty.toml     # Alacritty terminal config
└── scripts/
    ├── setup-fish.sh      # Fish shell installation
    └── symlink.sh         # Create symlinks
```

## 🚀 Manual Installation

If you prefer to run steps manually:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/slinkardbrandon/dotfiles.git ~/dotfiles
   cd ~/dotfiles
   ```

2. **Run bootstrap** (Xcode CLI Tools & Homebrew):
   ```bash
   bash bootstrap.sh
   ```

3. **Set up Fish shell**:
   ```bash
   bash scripts/setup-fish.sh
   ```

4. **Create symlinks**:
   ```bash
   bash scripts/symlink.sh
   ```

5. **Set macOS defaults** (optional):
   ```bash
   bash macos/defaults.sh
   ```

6. **Restart your terminal**:
   ```bash
   exec fish
   ```

## 🔧 Customization

### Update Git User Info

Edit `git/.gitconfig` and update:
```ini
[user]
    name = Your Name
    email = your.email@example.com
    signingkey = YOUR_GPG_KEY
```

### Add More Homebrew Packages

Edit `bootstrap.sh` and add packages to the `brew install` commands.

### Customize macOS Defaults

Edit `macos/defaults.sh` to add or remove system preferences.

### Add Fisher Plugins

Edit `fish/fish_plugins` and add plugin repositories, then run:
```bash
fisher update
```

## 🔄 Updating

To update your dotfiles on an already configured machine:

```bash
cd ~/dotfiles
git pull
bash scripts/symlink.sh
fisher update
```

## 📝 Notes

- The installer is idempotent - safe to run multiple times
- Existing files are backed up with `.backup` extension
- macOS defaults require a logout/restart to fully take effect
- Fish shell will become your default after installation
- Fisher plugins (nvm.fish, z) will be auto-installed

## 🤝 Credits

Inspired by the dotfiles community and various macOS setup scripts.

## 📄 License

MIT License - feel free to use and modify as needed.
