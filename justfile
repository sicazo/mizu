# Release helpers for Mizu
# Usage:
#   just release patch     → 0.1.0 → 0.1.1
#   just release minor     → 0.1.0 → 0.2.0
#   just release major     → 0.1.0 → 1.0.0
#   just release 1.2.3     → pin to exact version

release bump="patch":
    #!/usr/bin/env bash
    set -euo pipefail

    current=$(node -p "require('./package.json').version")
    echo "Current version: $current"

    # Parse semver
    major=$(echo "$current" | cut -d. -f1)
    minor=$(echo "$current" | cut -d. -f2)
    patch=$(echo "$current" | cut -d. -f3)

    case "{{bump}}" in
        major) next="$((major + 1)).0.0" ;;
        minor) next="${major}.$((minor + 1)).0" ;;
        patch) next="${major}.${minor}.$((patch + 1))" ;;
        *)     next="{{bump}}" ;;  # treat as explicit version
    esac

    echo "Bumping to: $next"

    # Update package.json
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      pkg.version = '$next';
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "

    # Update src-tauri/tauri.conf.json
    node -e "
      const fs = require('fs');
      const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
      conf.version = '$next';
      fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
    "

    # Update src-tauri/Cargo.toml
    sed -i.bak "s/^version = \"${current}\"/version = \"${next}\"/" src-tauri/Cargo.toml
    rm -f src-tauri/Cargo.toml.bak

    git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
    git commit -m "chore: release v${next}"
    git tag "v${next}"
    git push origin master --tags

    echo ""
    echo "✓ Tagged v${next} and pushed — CI will build and deploy"

# Show current version
version:
    @node -p "require('./package.json').version"
