# Fork Release & Auto-Update Implementation Plan

## Overview

**Goal:** Maintain a fork of Superset with custom changes, sync upstream periodically, and release independently with auto-updates.

**Key Decisions:**
- **Versioning:** Independent `1.x.x` (upstream uses `0.0.x`) - auto-incremented on each release
- **Branch:** `release` (triggers builds on push)
- **Trigger:** Push to `release` branch auto-increments patch version and creates release
- **Updates:** Only from fork's GitHub releases
- **Platform:** macOS arm64 only (intentional limitation)

---

## Branch Strategy

```
upstream/main ──────────────────────────────────────►
                    │           │           │
                    ▼           ▼           ▼
your/main ──────────●───────────●───────────●──────► (tracks upstream)
                    │           │           │
                    ▼           ▼           ▼
your/release ───────●───────────●───────────●──────► (auto-releases)
                   1.0.1       1.0.2       1.0.3
```

**Branches:**
- `main` - Synced with upstream, your PRs staged here
- `release` - Push here triggers auto-versioned release

---

## Workflow: Automatic Release on Push

```
Push to release branch (with desktop/ changes)
        ↓
Skip if commit is from github-actions[bot]
        ↓
Read version from package.json (e.g., 1.0.5)
        ↓
Increment patch → 1.0.6
        ↓
FAIL if tag v1.0.6 already exists
        ↓
Commit version bump + lockfile
        ↓
Create + push tag v1.0.6 (capture SHA)
        ↓
Build from exact SHA → Sign → Notarize
        ↓
Verify version matches expected
        ↓
Create GitHub Release (published, not draft)
```

---

## Files to Modify

### 1. `apps/desktop/package.json`

**Change:** Set initial version to `1.0.0`

```json
// Line 5
"version": "1.0.0",
```

**Current:** ✅ Applied

---

### 2. `apps/desktop/electron-builder.ts`

**Change:** Update publish owner to your GitHub username

```typescript
// Lines 21-25
publish: {
  provider: "github",
  owner: "andreasasprou",
  repo: "superset",
},
```

**Current:** ✅ Applied

---

### 3. `apps/desktop/src/main/lib/auto-updater.ts`

**Change:** Update feed URL to your fork

```typescript
// Lines 10-11
const UPDATE_FEED_URL =
  "https://github.com/andreasasprou/superset/releases/latest/download";
```

**Current:** ✅ Applied

---

### 4. `apps/desktop/src/shared/auto-update.ts`

**Change:** Update releases URL to your fork

```typescript
// Line 12
export const RELEASES_URL = "https://github.com/andreasasprou/superset/releases";
```

**Current:** ✅ Applied

---

### 5. `.github/workflows/release-desktop.yml`

**Change:** Complete replacement with branch-based auto-versioning workflow

```yaml
name: Release Desktop App

on:
  push:
    branches:
      - release
    paths:
      - 'apps/desktop/**'
  workflow_dispatch:
    inputs:
      skip_version_bump:
        description: "Skip auto version bump (use current package.json version)"
        required: false
        type: boolean
        default: false

# Prevent concurrent releases from racing
concurrency:
  group: release-desktop
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  version:
    name: Bump Version & Create Tag
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.bump.outputs.version }}
      tag: ${{ steps.bump.outputs.tag }}
      sha: ${{ steps.bump.outputs.sha }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      # Prevent infinite loop: skip if this commit was made by the bot
      - name: Check if triggered by version bump
        id: check
        run: |
          AUTHOR=$(git log -1 --pretty=format:'%an')
          MESSAGE=$(git log -1 --pretty=format:'%s')
          if [[ "$AUTHOR" == "github-actions[bot]" ]] && [[ "$MESSAGE" == *"chore: bump desktop version"* ]]; then
            echo "skip=true" >> $GITHUB_OUTPUT
            echo "Skipping: this commit is a version bump from the bot"
          else
            echo "skip=false" >> $GITHUB_OUTPUT
          fi

      - name: Setup Git
        if: steps.check.outputs.skip != 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Setup Bun (for lockfile update)
        if: steps.check.outputs.skip != 'true'
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: '1.3.2'

      - name: Bump version and create tag
        if: steps.check.outputs.skip != 'true'
        id: bump
        run: |
          cd apps/desktop
          
          # Get current version
          CURRENT=$(jq -r '.version' package.json)
          echo "Current version: $CURRENT"
          
          if [[ "${{ inputs.skip_version_bump }}" == "true" ]]; then
            NEW=$CURRENT
            echo "Skipping version bump, using: $NEW"
          else
            # Increment patch version (1.0.5 → 1.0.6)
            NEW=$(echo $CURRENT | awk -F. '{print $1"."$2"."$3+1}')
            echo "New version: $NEW"
          fi
          
          TAG="v$NEW"
          
          # FAIL FAST if tag already exists (prevents building wrong code)
          if git rev-parse "$TAG" >/dev/null 2>&1; then
            echo "::error::Tag $TAG already exists! Manually bump version in package.json or delete the existing tag."
            exit 1
          fi
          
          if [[ "${{ inputs.skip_version_bump }}" != "true" ]]; then
            # Update package.json
            jq --arg v "$NEW" '.version = $v' package.json > tmp.json && mv tmp.json package.json
            
            # Update lockfile to reflect version change (go to repo root)
            cd ../..
            bun install --no-save
            
            # Commit version bump AND lockfile
            git add apps/desktop/package.json bun.lock
            git commit -m "chore: bump desktop version to $NEW [skip ci]"
            git push origin release
          fi
          
          # Capture the exact SHA we're tagging
          SHA=$(git rev-parse HEAD)
          echo "Tagging SHA: $SHA"
          
          # Create and push tag on this exact SHA
          git tag "$TAG" "$SHA"
          git push origin "$TAG"
          
          echo "version=$NEW" >> $GITHUB_OUTPUT
          echo "tag=$TAG" >> $GITHUB_OUTPUT
          echo "sha=$SHA" >> $GITHUB_OUTPUT

      - name: Skip remaining jobs if bot commit
        if: steps.check.outputs.skip == 'true'
        run: |
          echo "version=" >> $GITHUB_OUTPUT
          echo "tag=" >> $GITHUB_OUTPUT
          echo "sha=" >> $GITHUB_OUTPUT

  build:
    name: Build - macOS (${{ matrix.arch }})
    needs: version
    if: needs.version.outputs.sha != ''
    runs-on: macos-latest
    # environment: production  # Optional: uncomment to require approval before builds

    strategy:
      fail-fast: false
      matrix:
        arch: [arm64]

    steps:
      - name: Checkout code at exact SHA
        uses: actions/checkout@v4
        with:
          ref: ${{ needs.version.outputs.sha }}

      - name: Verify version matches expected
        run: |
          ACTUAL=$(jq -r '.version' apps/desktop/package.json)
          EXPECTED="${{ needs.version.outputs.version }}"
          if [[ "$ACTUAL" != "$EXPECTED" ]]; then
            echo "::error::Version mismatch! Expected $EXPECTED but found $ACTUAL"
            exit 1
          fi
          echo "Version verified: $ACTUAL"

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: '1.3.2'

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ needs.version.outputs.sha }}
          restore-keys: |
            ${{ runner.os }}-bun-

      - name: Install dependencies
        run: bun install

      - name: Clean dev folder
        working-directory: apps/desktop
        run: bun run clean:dev

      - name: Compile app with electron-vite
        working-directory: apps/desktop
        env:
          NEXT_PUBLIC_POSTHOG_KEY: ${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}
          NEXT_PUBLIC_POSTHOG_HOST: ${{ secrets.NEXT_PUBLIC_POSTHOG_HOST }}
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GH_CLIENT_ID: ${{ secrets.GH_CLIENT_ID }}
          NEXT_PUBLIC_WEB_URL: ${{ secrets.NEXT_PUBLIC_WEB_URL }}
          NEXT_PUBLIC_API_URL: ${{ secrets.NEXT_PUBLIC_API_URL }}
          SENTRY_DSN_DESKTOP: ${{ secrets.SENTRY_DSN_DESKTOP }}
        run: bun run compile:app

      - name: Build Electron app
        working-directory: apps/desktop
        env:
          CSC_LINK: ${{ secrets.MAC_CERTIFICATE }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: bun run package -- --publish never

      - name: Upload DMG artifact
        uses: actions/upload-artifact@v4
        with:
          name: desktop-mac-${{ matrix.arch }}-dmg
          path: apps/desktop/release/*.dmg
          retention-days: 30
          if-no-files-found: error

      - name: Upload ZIP artifact
        uses: actions/upload-artifact@v4
        with:
          name: desktop-mac-${{ matrix.arch }}-zip
          path: apps/desktop/release/*.zip
          retention-days: 30
          if-no-files-found: error

      - name: Upload auto-update manifest
        uses: actions/upload-artifact@v4
        with:
          name: desktop-mac-update-manifest
          path: apps/desktop/release/latest-mac.yml
          retention-days: 30
          if-no-files-found: error

  release:
    name: Create GitHub Release
    needs: [version, build]
    if: needs.version.outputs.sha != ''
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: release-artifacts
          merge-multiple: true

      - name: Create stable-named copies for latest download URLs
        run: |
          cd release-artifacts
          for file in *.dmg; do
            if [[ -f "$file" ]]; then
              arch=$(echo "$file" | sed -E 's/.*-([^-]+)\.dmg$/\1/')
              cp "$file" "Superset-${arch}.dmg"
              echo "Created stable copy: Superset-${arch}.dmg"
            fi
          done
          for file in *-mac.zip; do
            if [[ -f "$file" ]]; then
              arch=$(echo "$file" | sed -E 's/.*-([^-]+)-mac\.zip$/\1/')
              cp "$file" "Superset-${arch}-mac.zip"
              echo "Created stable copy: Superset-${arch}-mac.zip"
            fi
          done
          echo "Release artifacts:"
          ls -la

      # IMPORTANT: draft: false is required for auto-updates to work
      # The /releases/latest/download URL only serves PUBLISHED releases
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ needs.version.outputs.tag }}
          files: release-artifacts/*
          draft: false
          generate_release_notes: true
          name: Superset Desktop ${{ needs.version.outputs.version }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Initial Setup Steps (One-Time)

### 1. Create Release Branch

```bash
git checkout main
git checkout -b release
git push -u origin release
```

### 2. Apply File Changes

Modify the 4 source files listed above with your GitHub username.

### 3. Add GitHub Secrets

In your fork: **Settings → Secrets and variables → Actions**

| Secret | Description | How to Get |
|--------|-------------|-----------|
| `MAC_CERTIFICATE` | Base64-encoded .p12 certificate | `base64 -i cert.p12 \| pbcopy` |
| `MAC_CERTIFICATE_PASSWORD` | Password for .p12 file | Set when exporting from Keychain |
| `APPLE_ID` | Your Apple ID email | Your developer account email |
| `APPLE_ID_PASSWORD` | App-specific password | Generate at appleid.apple.com → Security |
| `APPLE_TEAM_ID` | 10-character team ID | developer.apple.com → Membership |

**Optional secrets** (for full functionality):
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` - Analytics
- `GOOGLE_CLIENT_ID` / `GH_CLIENT_ID` - OAuth
- `NEXT_PUBLIC_WEB_URL` / `NEXT_PUBLIC_API_URL` - API endpoints
- `SENTRY_DSN_DESKTOP` - Error tracking

### 4. First Release

```bash
git checkout release
# Make sure all file changes are committed
git push origin release
```

The workflow will:
1. Bump version `1.0.0` → `1.0.1`
2. Update lockfile and commit with `[skip ci]`
3. Create tag `v1.0.1` at exact SHA
4. Build, sign, notarize
5. Create **published** GitHub Release (required for auto-updates)

---

## How Auto-Updates Work

1. App checks `latest-mac.yml` from YOUR fork's `/releases/latest/download/` every 4 hours
2. Compares installed version vs released version
3. If newer version available → downloads update automatically
4. Shows toast notification when ready
5. Installs on app quit

**Important:** The `/releases/latest/download` URL only serves **published** releases (not drafts, not prereleases). The workflow sets `draft: false` to ensure this works.

**Your users only get YOUR releases** - completely independent from upstream.

---

## Platform Limitations

**This workflow only builds for macOS arm64 (Apple Silicon).**

This is intentional because:
- Auto-update checks in `auto-updater.ts` are macOS-only (`if (!PLATFORM.IS_MAC) return`)
- Building for other platforms would require additional CI runners and testing

To add other platforms later:
- macOS x64: Add to matrix `arch: [arm64, x64]`
- Windows: Add separate job with `runs-on: windows-latest`
- Linux: Add separate job with `runs-on: ubuntu-latest`

---

## Syncing Upstream Changes

When upstream has changes you want:

```bash
# 1. Fetch upstream
git fetch upstream

# 2. Merge to your main
git checkout main
git merge upstream/main
git push origin main

# 3. Merge to release (triggers auto-release)
git checkout release
git merge main
git push origin release  # → Auto-builds new version
```

---

## Conflict Resolution

Files that will **always conflict** when merging upstream:

| File | Resolution |
|------|------------|
| `apps/desktop/package.json` | Keep YOUR version number |
| `apps/desktop/electron-builder.ts` | Keep YOUR owner |
| `apps/desktop/src/main/lib/auto-updater.ts` | Keep YOUR feed URL |
| `apps/desktop/src/shared/auto-update.ts` | Keep YOUR releases URL |

**Tip:** These are your "fork-specific" files. Always resolve conflicts by keeping your values.

---

## Apple Developer Setup (Required)

Code signing is **required** for macOS auto-updates to work.

1. **Join Apple Developer Program** - https://developer.apple.com/programs/ ($99/year)

2. **Create Developer ID Application certificate:**
   - Certificates, Identifiers & Profiles → Certificates → Create
   - Select "Developer ID Application"
   - Download and install in Keychain

3. **Export as .p12:**
   - Keychain Access → My Certificates → Right-click cert → Export
   - Choose .p12 format, set a password
   - Convert to base64: `base64 -i cert.p12 | pbcopy`

4. **Create app-specific password:**
   - https://appleid.apple.com → Security → App-Specific Passwords
   - Generate one for "Superset Notarization"

5. **Get your Team ID:**
   - https://developer.apple.com/account → Membership Details

---

## Verification Checklist

Before first release, verify:

- [ ] `release` branch exists and is pushed to origin
- [ ] `apps/desktop/package.json` version is `1.0.0`
- [ ] `electron-builder.ts` has your GitHub username as owner
- [ ] `auto-updater.ts` has your fork's URL
- [ ] `auto-update.ts` has your fork's releases URL
- [ ] All required GitHub secrets are set
- [ ] Apple Developer certificate is valid and exported

---

## Rollback Strategy

If a release has issues:

1. **Delete the GitHub Release** (keeps the tag)
2. **Fix the issue** on `release` branch
3. **Push again** → New version auto-created

Or for immediate rollback:
1. Users can download previous version from Releases page
2. Auto-updater won't downgrade (by design) - users must manually install

---

## Edge Cases Handled

| Edge Case | How It's Handled |
|-----------|------------------|
| Tag already exists | Workflow fails fast with clear error message |
| Version bump triggers another run | Skipped via commit author + message check |
| Concurrent pushes racing | `concurrency` group prevents parallel runs |
| Wrong code built | SHA-based checkout + version verification |
| Lockfile out of sync | Updated alongside version bump |
| Draft release blocking updates | `draft: false` ensures published release |

---

## Security Notes

- Signing secrets are repository secrets (accessible to any workflow on protected branches)
- Optional: Create a `production` environment with required reviewers for extra security
- Never run this workflow on PRs from forks (they can't access secrets anyway)
- Avoid enabling debug logging that might print secrets

---

## Questions / Decisions Captured

| Question | Decision |
|----------|----------|
| Fork coexist with upstream? | No - only running fork |
| Change app name? | No - keep "Superset" |
| Version strategy | Auto-increment patch on push |
| Starting version | `1.0.0` |
| Trigger mechanism | Push to `release` branch |
| Platforms | macOS arm64 only (intentional) |
