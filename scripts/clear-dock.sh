#!/usr/bin/env bash

################################################################################
# scripts/clear-dock.sh
# Remove default macOS bloatware and ensure Core Apps are in Dock
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. Ensure dockutil is present
if ! command -v dockutil &> /dev/null; then
    print_info "Installing dockutil..."
    brew install dockutil
fi

# 2. Define the "Bloatware" to get rid of
APPS_TO_REMOVE=(
    "Messages" "Mail" "Maps" "Photos" "FaceTime" "Phone" 
    "Calendar" "Contacts" "Reminders" "Notes" "TV" "Music" "News"
)

# 3. Define your "Core 4"
CORE_APPS=(
    "Obsidian"
    "Visual Studio Code"
    "Microsoft Teams"
    "Google Chrome"
)

print_info "Cleaning up default bloat..."
for app in "${APPS_TO_REMOVE[@]}"; do
    # --find checks if it exists before trying to remove, avoiding error noise
    if dockutil --find "$app" &>/dev/null; then
        dockutil --remove "$app" --no-restart
    fi
done

print_info "Ensuring Core Apps are present..."
for app in "${CORE_APPS[@]}"; do
    if ! dockutil --find "$app" &>/dev/null; then
        print_info "Adding $app to Dock..."
        # This adds to the end; dockutil also supports --position if you're picky
        dockutil --add "/Applications/$app.app" --no-restart || print_warning "Couldn't find $app in /Applications"
    else
        print_info "$app is already in Dock, skipping..."
    fi
done

# 4. Only restart if changes were likely made
print_info "Refreshing Dock..."
killall Dock

print_success "Dock sync complete! Your custom shortcuts were left untouched."
