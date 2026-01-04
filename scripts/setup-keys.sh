#!/bin/bash

# Color output functions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is designed for macOS only"
    exit 1
fi

# Check and install dependencies
print_info "Checking dependencies..."

if ! command -v brew &> /dev/null; then
    print_error "Homebrew is not installed. Please run bootstrap.sh first."
    exit 1
fi

# Check for required tools
MISSING_DEPS=()

if ! command -v gpg &> /dev/null; then
    MISSING_DEPS+=("gnupg")
fi

if ! command -v pinentry-mac &> /dev/null; then
    MISSING_DEPS+=("pinentry-mac")
fi

if ! command -v gh &> /dev/null; then
    MISSING_DEPS+=("gh")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    print_warning "Missing dependencies: ${MISSING_DEPS[*]}"
    read -p "Install missing dependencies? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install "${MISSING_DEPS[@]}"
        print_success "Dependencies installed"
    else
        print_error "Cannot proceed without required dependencies"
        exit 1
    fi
fi

# Configure GPG agent to use pinentry-mac
print_info "Configuring GPG agent..."
mkdir -p ~/.gnupg
chmod 700 ~/.gnupg

cat > ~/.gnupg/gpg-agent.conf <<EOF
# Enable GPG to use the pinentry-mac for passphrase entry
pinentry-program $(which pinentry-mac)
default-cache-ttl 600
max-cache-ttl 7200
enable-ssh-support
EOF

chmod 600 ~/.gnupg/gpg-agent.conf

# Restart GPG agent
gpgconf --kill gpg-agent
gpgconf --launch gpg-agent

print_success "GPG agent configured"

# ============================================================================
# SSH Key Setup
# ============================================================================

print_info "=== SSH Key Setup ==="

SSH_DIR="$HOME/.ssh"
SSH_KEY="$SSH_DIR/id_ed25519"

if [ -f "$SSH_KEY" ]; then
    print_warning "SSH key already exists at $SSH_KEY"
    read -p "Do you want to create a new one? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Skipping SSH key generation"
    else
        SSH_KEY="$SSH_DIR/id_ed25519_new"
    fi
fi

if [ ! -f "$SSH_KEY" ]; then
    print_info "Generating new SSH key..."
    read -p "Enter your email for SSH key: " SSH_EMAIL

    mkdir -p "$SSH_DIR"
    chmod 700 "$SSH_DIR"

    ssh-keygen -t ed25519 -C "$SSH_EMAIL" -f "$SSH_KEY"

    if [ $? -eq 0 ]; then
        print_success "SSH key generated: $SSH_KEY"
    else
        print_error "Failed to generate SSH key"
        exit 1
    fi
fi

# Configure SSH agent
print_info "Configuring SSH agent..."

cat > "$SSH_DIR/config" <<EOF
# Auto-load SSH keys and use macOS keychain
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519

# GitHub
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
EOF

chmod 600 "$SSH_DIR/config"

# Add key to ssh-agent
eval "$(ssh-agent -s)" > /dev/null 2>&1
ssh-add --apple-use-keychain "$SSH_KEY" 2>/dev/null

print_success "SSH configured"

# ============================================================================
# GPG Key Setup
# ============================================================================

print_info "=== GPG Key Setup ==="

# Check if GPG key already exists
GPG_KEYS=$(gpg --list-secret-keys --keyid-format=long 2>/dev/null)

if [ -n "$GPG_KEYS" ]; then
    print_warning "Existing GPG keys found:"
    echo "$GPG_KEYS"
    echo
    read -p "Do you want to create a new GPG key? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Skipping GPG key generation"

        # Extract first key ID for git config
        GPG_KEY_ID=$(gpg --list-secret-keys --keyid-format=long | grep -A 1 "sec" | grep -v "sec" | awk '{print $1}' | head -n 1)

        if [ -n "$GPG_KEY_ID" ]; then
            print_info "Using existing GPG key: $GPG_KEY_ID"
        fi
    else
        GENERATE_NEW_GPG=true
    fi
else
    GENERATE_NEW_GPG=true
fi

if [ "$GENERATE_NEW_GPG" = true ]; then
    print_info "Generating new GPG key..."

    read -p "Enter your name: " GPG_NAME
    read -p "Enter your email: " GPG_EMAIL

    # Generate GPG key with batch mode
    cat > /tmp/gpg-key-script <<EOF
%echo Generating GPG key...
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: $GPG_NAME
Name-Email: $GPG_EMAIL
Expire-Date: 0
%no-protection
%commit
%echo Done
EOF

    gpg --batch --generate-key /tmp/gpg-key-script
    rm /tmp/gpg-key-script

    if [ $? -eq 0 ]; then
        print_success "GPG key generated"

        # Get the new key ID
        GPG_KEY_ID=$(gpg --list-secret-keys --keyid-format=long "$GPG_EMAIL" | grep -A 1 "sec" | grep -v "sec" | awk '{print $1}' | head -n 1)
        print_info "Your GPG key ID: $GPG_KEY_ID"
    else
        print_error "Failed to generate GPG key"
    fi
fi

# Configure Git to use GPG signing
if [ -n "$GPG_KEY_ID" ]; then
    print_info "Configuring Git to use GPG signing..."

    git config --global user.signingkey "$GPG_KEY_ID"
    git config --global commit.gpgsign true
    git config --global gpg.program $(which gpg)

    print_success "Git configured for GPG signing"
fi

# ============================================================================
# GitHub Integration
# ============================================================================

print_info "=== GitHub Integration ==="

# Function to upload keys to a GitHub account
upload_keys_to_github() {
    local hostname=$1
    local display_name=$2
    
    if [ -z "$hostname" ]; then
        hostname="github.com"
    fi
    
    # Check authentication for this host
    if gh auth status --hostname "$hostname" &> /dev/null; then
        print_success "Authenticated to $display_name"
        
        # Upload SSH key
        if [ -f "$SSH_KEY.pub" ]; then
            print_info "Uploading SSH key to $display_name..."
            gh ssh-key add "$SSH_KEY.pub" --title "$(hostname)-$(date +%Y%m%d)" --hostname "$hostname" 2>/dev/null
            if [ $? -eq 0 ]; then
                print_success "SSH key uploaded to $display_name"
            else
                print_warning "SSH key may already exist on $display_name"
            fi
        fi

        # Upload GPG key
        if [ -n "$GPG_KEY_ID" ]; then
            print_info "Uploading GPG key to $display_name..."
            gpg --armor --export "$GPG_KEY_ID" | gh gpg-key add --hostname "$hostname" 2>/dev/null
            if [ $? -eq 0 ]; then
                print_success "GPG key uploaded to $display_name"
            else
                print_warning "GPG key may already exist on $display_name"
            fi
        fi

        return 0
    else
        print_warning "Not authenticated to $display_name"
        echo "To authenticate, run: gh auth login --hostname $hostname"
        return 1
    fi
}

# Upload to personal GitHub
echo
read -p "Upload keys to github.com? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    upload_keys_to_github "github.com" "GitHub.com"
fi

# Ask about enterprise GitHub
echo
read -p "Do you have an enterprise GitHub account? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter enterprise GitHub hostname (e.g., github.company.com): " ENTERPRISE_HOST

    if [ -n "$ENTERPRISE_HOST" ]; then
        echo
        read -p "Upload keys to $ENTERPRISE_HOST? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            upload_keys_to_github "$ENTERPRISE_HOST" "$ENTERPRISE_HOST"
        fi
    fi
fi

# Offer to add more accounts
echo
read -p "Add keys to another GitHub account? (y/n) " -n 1 -r
echo
while [[ $REPLY =~ ^[Yy]$ ]]; do
    read -p "Enter GitHub hostname: " ADDITIONAL_HOST

    if [ -n "$ADDITIONAL_HOST" ]; then
        echo
        read -p "Upload keys to $ADDITIONAL_HOST? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            upload_keys_to_github "$ADDITIONAL_HOST" "$ADDITIONAL_HOST"
        fi
    fi

    echo
    read -p "Add keys to another GitHub account? (y/n) " -n 1 -r
    echo
done

# ============================================================================
# Backup Keys
# ============================================================================

print_info "=== Backup Keys ==="

read -p "Create encrypted backup of your keys? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    BACKUP_DIR="$HOME/.dotfiles-backup/keys-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"

    # Backup SSH keys
    if [ -f "$SSH_KEY" ]; then
        cp "$SSH_KEY" "$BACKUP_DIR/"
        cp "$SSH_KEY.pub" "$BACKUP_DIR/"
        print_info "SSH keys backed up"
    fi

    # Backup GPG keys
    if [ -n "$GPG_KEY_ID" ]; then
        gpg --armor --export-secret-keys "$GPG_KEY_ID" > "$BACKUP_DIR/gpg-private-key.asc"
        gpg --armor --export "$GPG_KEY_ID" > "$BACKUP_DIR/gpg-public-key.asc"
        print_info "GPG keys backed up"
    fi

    chmod 600 "$BACKUP_DIR"/*

    print_success "Keys backed up to: $BACKUP_DIR"
    print_warning "IMPORTANT: Store this backup in a secure location (1Password, etc.)"
fi

# ============================================================================
# Summary
# ============================================================================

echo
echo "========================================="
print_success "Key Setup Complete!"
echo "========================================="
echo

if [ -f "$SSH_KEY.pub" ]; then
    echo "📋 Your SSH Public Key:"
    echo "----------------------------------------"
    cat "$SSH_KEY.pub"
    echo "----------------------------------------"
    echo
fi

if [ -n "$GPG_KEY_ID" ]; then
    echo "🔑 Your GPG Public Key:"
    echo "----------------------------------------"
    gpg --armor --export "$GPG_KEY_ID"
    echo "----------------------------------------"
    echo
fi

echo "Next steps:"
echo "1. If not already done, authenticate with GitHub: gh auth login"
echo "2. Test SSH connection: ssh -T git@github.com"
echo "3. Test GPG signing: git commit --allow-empty -m 'test signing'"
echo "4. Store your backup securely if created"
echo

print_info "Done!"
