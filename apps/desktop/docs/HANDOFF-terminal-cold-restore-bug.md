# Terminal Cold Restore Bug - Handoff Document

**Date:** 2026-01-09
**Status:** LIKELY FIXED (pending verification) - see "Root Cause + Fix"
**Severity:** Critical - terminal input goes to tab name instead of terminal after cold restore

## Problem Summary

After daemon restart/session loss, clicking "Start Shell" creates a new terminal session, but:
1. Keyboard input goes to the tab name (visible as "Hello" or "sshi" in tab)
2. Nothing appears in the terminal
3. Writes ARE reaching the daemon (logs show `writeRef` being called)
4. Data IS coming back from daemon (logs show `TerminalHostClient` and `DaemonTerminalManager` receiving data)
5. BUT `listeners=0` means the tRPC subscription isn't receiving the data

## Key Observation from Logs

```
[DaemonTerminalManager] Received data from daemon: paneId=..., bytes=211, listeners=1  # Working!
[DaemonTerminalManager] Received data from daemon: paneId=..., bytes=280, listeners=1  # Still working
[DaemonTerminalManager] Terminal error for pane-...: WRITE_FAILED: Session not found
[DaemonTerminalManager] Session pane-... lost - will trigger cold restore on next attach
[DaemonTerminalManager] Received data from daemon: paneId=..., bytes=4, listeners=0   # BROKEN!
[DaemonTerminalManager] Received data from daemon: paneId=..., bytes=388, listeners=0  # Still broken
```

**Critical:** Listeners go from 1 to 0 AFTER the "Session lost" event, BEFORE handleStartShell is called.

## Root Cause + Fix

### Root cause
The tRPC subscription was being **completed** when the terminal stream emitted an `exit` event.

This can happen during cold restore / daemon session loss because `terminal.write` catches
`Terminal session <paneId> not found or not alive` and emits `exit:${paneId}` (to avoid toast floods).

Once the server completes the observable, **`trpc.useSubscription` does not auto-resubscribe** (since
the `paneId` input doesn't change). That leaves `listeners=0` permanently, so daemon output never reaches
the renderer even after a new session is created.

### Fix
Keep the subscription open on `exit`:
- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`: remove `emit.complete()` from `onExit` in `stream` subscription

This preserves the data listener across exit/session-loss transitions, so when a new daemon session is created (same `paneId`)
output flows again.

### Gotcha: terminal clears after clicking "Start Shell"
If the terminal clears and nothing renders after clicking "Start Shell", check for a stale queued `exit` event:
- In cold restore mode we intentionally pause streaming (`isStreamReady=false`), which queues stream events.
- If the user typed while the overlay was up, a write can fail and emit an `exit` event.
- When streaming resumes, that queued `exit` marks the terminal as exited and the next keypress triggers `restartTerminal()`, which calls `xterm.clear()`.

Mitigations (implemented):
- Clear `pendingEventsRef.current` at the start of `handleStartShell`
- Ignore terminal input / keypress handling while `isRestoredMode` or `connectionError` overlays are visible

### How to verify
1. Run with logging: `SUPERSET_TERMINAL_DEBUG=1 bun dev`
2. Repro: kill daemon (`pkill -f "terminal-host"`), get cold restore UI, click "Start Shell"
3. Confirm:
   - `[DaemonTerminalManager] ... listeners=1` remains true after session loss and after starting shell
   - terminal output appears again after "Start Shell"

## Architecture Overview

```
Renderer (Terminal.tsx)
    |
    | trpc.terminal.stream.useSubscription(paneId)
    v
tRPC Router (terminal.ts) - EventEmitter listeners attached here
    |
    | terminalManager.on(`data:${paneId}`, handler)
    v
DaemonTerminalManager (daemon-manager.ts) - emits events
    |
    | this.emit(`data:${paneId}`, data)
    v
TerminalHostClient (client.ts) - socket to daemon
    |
    v
Terminal Host Daemon (separate process) - actual PTY
```

## Failed Fix Attempts

### 1. HMR-Stable Singletons (didn't work)
Made `DaemonTerminalManager` and `TerminalHostClient` singletons stored on `globalThis` to survive HMR module reloads.

Files changed:
- `apps/desktop/src/main/lib/terminal/daemon-manager.ts` - added `__supersetDaemonTerminalManager` on globalThis
- `apps/desktop/src/main/lib/terminal-host/client.ts` - added `__supersetTerminalHostClient` on globalThis

**Result:** Still `listeners=0` after session loss

### 2. Fresh Manager Reference in Subscription (didn't work)
Changed terminal router to call `getActiveTerminalManager()` inside the subscription callback instead of capturing it at router creation time.

File changed:
- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`

**Result:** Still `listeners=0` after session loss

### 3. Move State Change to onSuccess (didn't work)
Moved `setIsRestoredMode(false)` from before `createOrAttachRef.current()` to inside `onSuccess` callback to prevent React re-render from tearing down subscription.

File changed:
- `apps/desktop/src/renderer/.../Terminal/Terminal.tsx` - `handleStartShell` function

**Result:** Still `listeners=0` after session loss

## What I Don't Understand

1. **Why do listeners drop to 0 after session loss?** The subscription should still be active - we're just getting an error event.

2. **Was the subscription being torn down?** Yes — it was being completed on `exit` (via `emit.complete()`), which left `useSubscription` stuck without re-subscribing for the same `paneId`.

3. **Is there a disconnect handler that tears things down?** The stream subscription has an `onDisconnect` handler but I don't see it completing the observable.

4. **Is trpc-electron doing something?** The IPC transport might have its own subscription management.

5. **Is React Query tearing down the subscription?** The `useSubscription` hook might be doing something on certain events.

## Key Files to Investigate

1. **`apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`**
   - Lines 384-451: The `stream` subscription
   - `onDisconnect` handler at line 419-421 - does this do something that breaks things?
   - Cleanup function at lines 441-449 - when is this called?

2. **`apps/desktop/src/main/lib/terminal/daemon-manager.ts`**
   - Session loss handling around line 236: `this.coldRestoreInfo.set(paneId, ...)`
   - Event emission: `this.emit(\`disconnect:${paneId}\`, reason)`
   - The `listeners=0` log is at line ~196

3. **`apps/desktop/src/renderer/.../Terminal/Terminal.tsx`**
   - `useSubscription` hook around line 895
   - How does it handle disconnect events?
   - What causes the subscription to be recreated?

4. **`node_modules/trpc-electron`** (or wherever the IPC transport is)
   - How does it handle subscriptions?
   - Is there automatic reconnection logic that breaks things?

## Reproduction Steps

1. Open desktop app with a terminal
2. Type something to verify it works
3. Kill the daemon: `pkill -f "terminal-host"` or delete `~/.superset-dev/terminal-host.sock`
4. The terminal shows cold restore UI
5. Click "Start Shell"
6. Type in the terminal
7. **EXPECTED:** Text appears in terminal
8. **ACTUAL:** Text appears in tab name, terminal is blank

## Debugging Tips

Enable debug logging:
```bash
SUPERSET_TERMINAL_DEBUG=1 bun dev
```

Key log patterns to watch:
- `[Terminal Stream] Subscribe` - when subscription is set up
- `[Terminal Stream] Unsubscribe` - when subscription is torn down
- `[DaemonTerminalManager] Received data from daemon: ... listeners=X` - the critical metric
- `[Terminal] Stream data received` - data reaching renderer (should appear but doesn't)

## Hypotheses to Test

1. **Subscription is being recreated on disconnect** - Add logging to see if `[Terminal Stream] Unsubscribe` is called after session loss

2. **Event listeners are being removed** - Add logging in daemon-manager when `off()` is called

3. **Different EventEmitter instances** - Even with globalThis, maybe something is creating a new instance

4. **trpc-electron reconnection** - The IPC transport might reconnect and not re-establish subscriptions

5. **React component unmounting** - Maybe the Terminal component is being unmounted and remounted

## Current State of Code

The codebase has debug logging added. Key changes from this session:
- HMR-stable singletons on globalThis (may or may not be necessary)
- `handleStartShell` moves state change to onSuccess (may or may not be necessary)
- Extensive console logging for debugging

## Contact

This handoff was created by a Claude session that got stuck. The session transcript is at:
`/Users/andreasasprou/.claude/projects/-Users-andreasasprou--superset-worktrees-superset-persistentterminals/e4e44094-f9c3-40c3-b817-d0e71fd52ecd.jsonl`
