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

**Current state:**
- Git status: !`git status --short`
- Current branch: !`git branch --show-current`
- Remotes: !`git remote -v | head -6`

## Process

### Step 1: Validate Environment

1. Ensure working directory is clean (no uncommitted changes)
2. Ensure we're on the `release` branch, or switch to it
3. Ensure `upstream` remote exists pointing to `superset-sh/superset`
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

### Step 3: Fetch PR Branch

```bash
git fetch upstream pull/$ARGUMENTS/head:pr-$ARGUMENTS
```

This creates a local branch `pr-$ARGUMENTS` with the PR's commits.

### Step 4: Analyze Merge Strategy

Check for potential conflicts, especially in:
- `packages/local-db/drizzle/` (migrations - may need renumbering)
- `apps/desktop/` (main app code)

If migrations conflict:
1. List existing migrations: `ls packages/local-db/drizzle/*.sql | sort`
2. List PR migrations: `git diff release...pr-$ARGUMENTS --name-only | grep drizzle`
3. Determine if renumbering is needed

### Step 5: Merge

**Option A - Clean merge (no conflicts expected):**
```bash
git merge pr-$ARGUMENTS --no-ff -m "Merge superset-sh/superset#$ARGUMENTS into release"
```

**Option B - If migrations need renumbering:**
1. Cherry-pick commits one by one
2. Rename migration files to next available sequence number
3. Update `drizzle/meta/_journal.json` accordingly

### Step 6: Resolve Conflicts (if any)

If conflicts occur:
1. List conflicted files: `git diff --name-only --diff-filter=U`
2. For each conflict:
   - Open the file and understand both sides
   - Resolve keeping the intent of both changes
   - For migrations: ensure sequential numbering
3. Stage resolved files: `git add <file>`
4. Complete merge: `git commit`

### Step 7: Verify

1. Run `bun install` to update lockfile if needed
2. Run `bun run typecheck` to ensure no type errors
3. Check migrations are sequential: `ls packages/local-db/drizzle/*.sql | sort`

### Step 8: Push (with confirmation)

Ask user before pushing:
```bash
git push origin release
```

### Step 9: Cleanup

```bash
git branch -d pr-$ARGUMENTS
```

## Important Notes

- **Never force push** to release branch without explicit confirmation
- **Migration conflicts** are the most common issue - always check numbering
- **If PR is part of a stack**, merge the entire stack (top branch) instead of individual PRs
- After merging, the release workflow may auto-trigger if `apps/desktop/**` files changed

## Output

Summarize what was merged:
- PR title and number
- Number of commits merged
- Any conflicts resolved
- Whether a new release build was triggered
