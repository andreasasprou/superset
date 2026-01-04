---
description: Merge a PR from superset-sh/superset into the fork's release branch
argument-hint: <pr-number>
---

# Merge Upstream PR to Release Branch

Merge PR #$ARGUMENTS from `superset-sh/superset` into `andreasasprou/superset` release branch.

## Context

**Repositories:**
- Upstream: `superset-sh/superset` (where PRs are created)
- Fork: `andreasasprou/superset` (where releases are built)
- Release branch: `release` on the fork

**Branch Strategy:**
- `main` = upstream + release-specific files (version, owner, URLs)
- `release` = reset to main, then merge PRs → triggers auto-release

**Current state:**
- Git status: !`git status --short`
- Current branch: !`git branch --show-current`
- Remotes: !`git remote -v | head -6`

## Process

### Step 1: Validate Environment

1. Ensure working directory is clean (no uncommitted changes)
2. Ensure `upstream` remote exists pointing to `superset-sh/superset`
   - If not: `git remote add upstream https://github.com/superset-sh/superset.git`

### Step 2: Fetch PR Information

Run these commands to gather PR details:
```bash
gh pr view $ARGUMENTS --repo superset-sh/superset --json number,title,headRefName,baseRefName,state,commits,files
```

Verify:
- PR is OPEN or MERGED (warn if closed without merge)
- Note the `headRefName` (PR branch name)
- Note the number of commits and files changed

### Step 3: Decide on Strategy

**Option A - Fresh release (recommended when starting new release):**
Reset release to main first, then merge PR.

**Option B - Incremental (adding to existing release):**
Just merge PR into current release state.

Ask user which strategy they want if unclear.

### Step 4A: Fresh Release Strategy

```bash
# Ensure main is up to date
git checkout main
git pull origin main

# Reset release to main
git checkout release
git reset --hard origin/main

# Fetch and merge PR
git fetch upstream pull/$ARGUMENTS/head:pr-$ARGUMENTS
git merge pr-$ARGUMENTS --no-ff -m "Merge superset-sh/superset#$ARGUMENTS into release"
```

### Step 4B: Incremental Strategy

```bash
# Stay on release, just merge PR
git checkout release
git fetch upstream pull/$ARGUMENTS/head:pr-$ARGUMENTS
git merge pr-$ARGUMENTS --no-ff -m "Merge superset-sh/superset#$ARGUMENTS into release"
```

### Step 5: Resolve Conflicts (if any)

If conflicts occur:
1. List conflicted files: `git diff --name-only --diff-filter=U`
2. For each conflict:
   - Open the file and understand both sides
   - Resolve keeping the intent of both changes
   - For migrations: ensure sequential numbering
3. Stage resolved files: `git add <file>`
4. Complete merge: `git commit`

### Step 6: Verify

1. Run `bun install` to update lockfile if needed
2. Run `bun run typecheck` to ensure no type errors
3. Check migrations are sequential: `ls packages/local-db/drizzle/*.sql | sort`

### Step 7: Push (with confirmation)

Ask user before pushing:

**For fresh release (Option A):**
```bash
git push --force-with-lease origin release
```

**For incremental (Option B):**
```bash
git push origin release
```

### Step 8: Cleanup

```bash
git branch -d pr-$ARGUMENTS
```

## Important Notes

- **Fresh release uses force push** - this is intentional since we reset the branch
- **Migration conflicts** are common - always check numbering
- **If PR is part of a stack**, merge the entire stack (top branch) instead of individual PRs
- After pushing, the release workflow auto-triggers if `apps/desktop/**` files changed

## Output

Summarize what was merged:
- PR title and number
- Strategy used (fresh or incremental)
- Number of commits merged
- Any conflicts resolved
- Whether a new release build was triggered
