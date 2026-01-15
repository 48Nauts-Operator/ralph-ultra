#!/bin/bash
# Ralph Ultra - Installation Script
# Adds ralph CLI to PATH

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Output helpers
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Determine script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RALPH_BIN="$SCRIPT_DIR/bin/ralph"

# Validate ralph binary exists
if [[ ! -f "$RALPH_BIN" ]]; then
  error "Ralph binary not found at: $RALPH_BIN"
fi

# Detect platform
detect_platform() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)  echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

PLATFORM=$(detect_platform)

# Determine installation directory
get_install_dir() {
  # Prefer /usr/local/bin if writable, otherwise use ~/bin
  if [[ -w "/usr/local/bin" ]]; then
    echo "/usr/local/bin"
  else
    echo "$HOME/bin"
  fi
}

# Show usage
show_usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Install ralph CLI to PATH

OPTIONS:
  --uninstall        Remove ralph from PATH
  --symlink          Install as symlink (default)
  --copy             Install as copy
  --dir <path>       Install to specific directory
  --help             Show this help message

EXAMPLES:
  $0                 Install ralph (symlink to /usr/local/bin or ~/bin)
  $0 --copy          Install ralph as copy
  $0 --dir ~/bin     Install to ~/bin
  $0 --uninstall     Remove ralph from PATH
EOF
}

# Parse arguments
UNINSTALL=false
INSTALL_METHOD="symlink"
INSTALL_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    --symlink)
      INSTALL_METHOD="symlink"
      shift
      ;;
    --copy)
      INSTALL_METHOD="copy"
      shift
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --help|-h)
      show_usage
      exit 0
      ;;
    *)
      error "Unknown option: $1\nUse --help for usage information"
      ;;
  esac
done

# Uninstall function
uninstall_ralph() {
  info "Uninstalling ralph..."

  local removed=false

  # Check common installation locations
  for dir in "/usr/local/bin" "$HOME/bin" "$HOME/.local/bin"; do
    local target="$dir/ralph"
    if [[ -e "$target" || -L "$target" ]]; then
      info "Removing: $target"
      rm -f "$target"
      removed=true
    fi
  done

  if [[ "$removed" == true ]]; then
    success "Ralph has been uninstalled"
    info "You may need to restart your shell or run: hash -r"
  else
    warn "Ralph installation not found"
  fi
}

# Install function
install_ralph() {
  # Determine installation directory
  if [[ -z "$INSTALL_DIR" ]]; then
    INSTALL_DIR=$(get_install_dir)
  fi

  # Create directory if it doesn't exist
  if [[ ! -d "$INSTALL_DIR" ]]; then
    info "Creating directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
  fi

  # Check write permissions
  if [[ ! -w "$INSTALL_DIR" ]]; then
    error "No write permission for: $INSTALL_DIR\nTry using sudo or specify a different directory with --dir"
  fi

  local target="$INSTALL_DIR/ralph"

  # Remove existing installation if present
  if [[ -e "$target" || -L "$target" ]]; then
    warn "Existing installation found at: $target"
    read -p "$(echo -e "${YELLOW}Overwrite? (y/N):${NC} ")" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      error "Installation cancelled"
    fi
    rm -f "$target"
  fi

  # Install based on method
  info "Installing ralph to: $target"

  if [[ "$INSTALL_METHOD" == "symlink" ]]; then
    ln -sf "$RALPH_BIN" "$target"
    info "Created symlink: $target -> $RALPH_BIN"
  else
    cp "$RALPH_BIN" "$target"
    chmod +x "$target"
    info "Copied binary to: $target"
  fi

  success "Ralph has been installed successfully!"

  # Check if directory is in PATH
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    warn "Installation directory is not in PATH: $INSTALL_DIR"
    echo
    info "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc):"
    echo -e "${CYAN}export PATH=\"\$PATH:$INSTALL_DIR\"${NC}"
    echo
    info "Then restart your shell or run: source ~/.bashrc (or ~/.zshrc)"
  fi

  # Verify installation
  echo
  info "Verifying installation..."
  if command -v ralph &> /dev/null; then
    success "ralph is now available in PATH"
    ralph --version
  else
    warn "ralph command not found in PATH yet"
    info "You may need to restart your shell or run: hash -r"
  fi
}

# Main execution
echo -e "${CYAN}Ralph Ultra Installer${NC}"
echo "Platform: $PLATFORM"
echo

if [[ "$PLATFORM" == "unknown" ]]; then
  error "Unsupported platform: $(uname -s)"
fi

if [[ "$UNINSTALL" == true ]]; then
  uninstall_ralph
else
  install_ralph
fi
