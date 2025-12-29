# Plan: Self-healing Agent Wrappers + Repair on Terminal Creation

## Problem
- `setupAgentHooks()` runs once on app startup
- If user installs `claude`/`codex` AFTER launching Superset, wrappers are never created
- Users don't get notification hooks for newly installed agents

Additional risks in current approach:
- There is already a module cycle: `terminal/env.ts` imports from `agent-setup/index.ts`, and `agent-setup/utils.ts` imports `getDefaultShell()` from `terminal/env.ts`. Adding more cross-imports increases the chance of init-order bugs.
- “Fire-and-forget” async work can still block terminal creation if it performs sync FS or sync shell exec work before its first `await`.

## Solution
1) **Always create Superset wrappers** (even if the real agent binary is missing).
   - Wrappers become **self-healing**: at runtime they scan `PATH` (excluding Superset bin dirs) to find the “real” agent binary and `exec` it with the notification hook injected.
   - If the real binary isn’t present, wrappers print a helpful install message and exit `127`.

2) **On terminal creation**, run a lightweight **repair/ensure** pass that verifies wrappers + support files exist and match a Superset marker/version, and rewrites them if missing/outdated.
   - This covers cases where users delete/modify files while the app is running, or we ship a wrapper format change.

## Implementation

### 0. Break the existing import cycle (small refactor)
**Path:** `apps/desktop/src/main/lib/terminal/env.ts`

- Stop importing `getShellEnv` from `apps/desktop/src/main/lib/agent-setup/index.ts`.
- Import it directly from `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts` instead.

This removes the `terminal/env.ts` ↔ `agent-setup/utils.ts` cycle and reduces the chance that adding a terminal-triggered ensure introduces init-order issues.

### 1. Update wrappers to be self-healing (no Node “which” needed)
**Path:** `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`

Goals:
- Wrappers exist regardless of agent install timing (supports “install then run in the same terminal”)
- No dependency on Node-side `findRealBinary*()` or PATH probing at wrapper creation time
- Avoid wrapper recursion by filtering both `~/.superset/bin` and `~/.superset-dev/bin`
- Include a **marker/version** and keep wrapper logic idempotent

Wrapper behavior (bash) should be:
- Determine wrapper dir (`$0`) and compute Superset bin dirs.
- Scan `PATH` entries in-order, skipping Superset bin dirs, and pick the first executable match.
- If not found: print install hint + exit `127`.
- If found: `exec "<real>" … "$@"` with hook injection.

### 2. Create a lightweight async ensure/repair pass (NEW FILE)
**Path:** `apps/desktop/src/main/lib/agent-setup/ensure-agent-hooks.ts`

Goals:
- Fast no-op when wrappers/support files are already present and valid (marker/version + required files)
- Safe under concurrent terminal creation (`inFlight` guard)
- Truly non-blocking when called “fire-and-forget” (yield immediately; async FS only)

Key checks (beyond “marker/version”):
- Wrapper file exists and contains expected marker/version
- `hooks/notify.sh` exists and is executable
- Claude: `hooks/claude-settings.json` exists (or is recreated)
- Optionally: if wrapper format embeds paths, validate referenced paths exist; otherwise wrapper runtime scanning handles it

Implementation notes:
- Use `fs.promises` (`readFile`, `writeFile`, `mkdir`) rather than sync FS.
- Ensure the function yields before heavy work, e.g. first line `await new Promise((r) => setImmediate(r))`.
- Keep logging quiet on the fast-path; only log on rewrites/failures.

### 3. Keep Node-side binary detection optional (de-scope from core fix)
**Path:** `apps/desktop/src/main/lib/agent-setup/utils.ts`

With self-healing wrappers, Node-side binary detection is no longer required for correctness.
If we still want it for diagnostics, keep `findRealBinary()` as-is or add `findRealBinaryAsync()` later, but don’t make wrapper correctness depend on it.
If we add the async version, it must include `timeout` + `maxBuffer` to avoid hangs from interactive shell profiles.

### 4. Hook ensure into terminal creation (best-effort repair before use)
**Path:** `apps/desktop/src/main/lib/terminal/manager.ts`

In `doCreateSession()`, start the ensure pass before awaiting session creation:

```ts
void ensureAgentHooks().catch((err) =>
  console.warn("[TerminalManager] Agent hook ensure failed:", err)
);
```

Because `ensureAgentHooks()` yields immediately and uses async FS only, it won’t block the terminal creation path.

### 5. Avoid deep exports that reintroduce cycles
**Path:** `apps/desktop/src/main/lib/agent-setup/index.ts`

- Keep `index.ts` focused on startup setup (`setupAgentHooks`) and shell wrappers.
- Import `ensureAgentHooks` directly from its module in `terminal/manager.ts` (do not route through `index.ts`) to keep dependency edges simple.

## Files to Modify

| File | Change |
|------|--------|
| `apps/desktop/src/main/lib/terminal/env.ts` | Break import cycle (import `getShellEnv` from `shell-wrappers.ts`) |
| `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts` | Always create self-healing wrappers + marker/version |
| `apps/desktop/src/main/lib/agent-setup/ensure-agent-hooks.ts` | **NEW** - Async ensure/repair pass |
| `apps/desktop/src/main/lib/terminal/manager.ts` | Fire-and-forget `ensureAgentHooks()` in `doCreateSession()` |
| `apps/desktop/src/main/lib/agent-setup/index.ts` | Keep exports minimal; avoid exporting ensure through index |

## Key Design Decisions

1. **Fast path** - Return quickly when wrappers exist and match expected marker/version
2. **In-flight guard** - Prevent overlapping runs when multiple terminals open concurrently
3. **Non-blocking** - Ensure yields immediately and uses async FS only
4. **Self-healing wrappers** - Runtime PATH scanning avoids “installed later” and “binary path changed” issues
5. **Stronger validity checks** - Marker/version + required support files, not marker alone
6. **Idempotent + repairable** - Safe to call repeatedly; can recreate wrappers when outdated/invalid
7. **Platform gating** - Keep Windows gated until we add Windows-compatible wrappers + hook implementation

## Testing
1. Start Superset without `claude`/`codex` installed
2. Verify wrapper files exist in Superset bin dir and include the marker/version line
3. Run `codex` / `claude` → wrapper should print a clear “not installed” message and exit `127`
4. Install codex inside the same Superset terminal: `npm i -g @openai/codex`
5. Run `codex` again → wrapper should now locate the real binary and notifications should fire on completion
6. Corrupt/delete a wrapper file while Superset is running, open a new Superset terminal → ensure pass should recreate it

## Windows follow-up (separate scope)
- **Current status:** Not supported end-to-end on Windows.
- **Why (call this out in the PR):**
  - Agent wrappers are bash scripts (`#!/bin/bash`), so they won’t run in the default Superset Windows shells (PowerShell/CMD).
  - Hook execution relies on `bash` + `curl` + `grep/cut` (`hooks/notify.sh`), which aren’t guaranteed on Windows.
  - Superset’s PATH interception is implemented for zsh/bash only, so `~/.superset*/bin` typically isn’t on PATH for PowerShell/CMD terminals.
  - Note: It may work in Git Bash/WSL environments, but that’s not “supported” behavior.
- Feasible later, but not a small patch: current hooks rely on `bash` + `curl` + `grep/cut` and wrapper scripts are bash-only.
- Proposed approach for Windows:
  1) Replace `hooks/notify.sh` with a cross-platform Node script (or a small bundled binary) that posts to `127.0.0.1` using Node’s HTTP APIs.
  2) Generate Windows shims (`codex.cmd` / `claude.cmd` or PowerShell wrappers) that invoke the real agent and call the notify helper.
  3) Ensure Superset terminal PATH injection supports PowerShell/CMD startup (analogous to zsh/bash wrappers on Unix).
