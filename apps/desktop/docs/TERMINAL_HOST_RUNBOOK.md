# Terminal Host Daemon — Operations Runbook

Quick reference for debugging and testing the terminal persistence daemon.

---

## File Locations

| Environment | Directory | Socket | PID | Logs |
|-------------|-----------|--------|-----|------|
| **Development** | `~/.superset-dev/` | `terminal-host.sock` | `terminal-host.pid` | `daemon.log` |
| **Production** | `~/.superset/` | `terminal-host.sock` | `terminal-host.pid` | None by default |

---

## Common Commands

```bash
# === STATUS ===
# Check if daemon is running
cat ~/.superset-dev/terminal-host.pid && ps -p $(cat ~/.superset-dev/terminal-host.pid)

# View daemon logs (dev only)
cat ~/.superset-dev/daemon.log
tail -f ~/.superset-dev/daemon.log  # Live follow

# === RESTART DAEMON ===
# Kill daemon (required to pick up code changes)
kill -9 $(cat ~/.superset-dev/terminal-host.pid)
# Daemon auto-restarts when app connects

# === FIND ORPHANS ===
# Dev orphan subprocesses
ps aux | grep "pty-subprocess.*persistent-terminals" | grep -v grep

# Production orphan subprocesses  
ps aux | grep "Superset.app.*pty-subprocess" | grep -v grep

# All terminal-related processes
ps aux | grep -E "terminal-host|pty-subprocess" | grep -v grep

# === CLEANUP ORPHANS ===
# Kill all dev subprocesses
pkill -9 -f "persistent-terminals.*pty-subprocess"

# Kill all production subprocesses (careful!)
pkill -9 -f "Superset.app.*pty-subprocess"
```

---

## Testing Kill Flow

1. **Kill existing daemon** (picks up code changes):
   ```bash
   kill -9 $(cat ~/.superset-dev/terminal-host.pid)
   ```

2. **Clear logs** (optional):
   ```bash
   > ~/.superset-dev/daemon.log
   ```

3. **Start dev server**, create workspace with terminals

4. **Delete the workspace**

5. **Check results**:
   ```bash
   # View kill flow in logs
   cat ~/.superset-dev/daemon.log | grep -E "handleKill|onExit|EXIT frame|Force disposing"
   
   # Verify no orphans
   ps aux | grep "pty-subprocess.*persistent-terminals" | grep -v grep
   ```

### Expected Log Flow (Success)
```
handleKill: calling pty.kill(SIGTERM)
handleKill: escalating to SIGKILL        # After 2s if needed
onExit fired: exitCode=0, signal=9
onExit: EXIT frame sent
Received EXIT frame
Subprocess exited with code 0
```

### Failure Indicators
- `Force disposing stuck session after 5000ms` — onExit never fired, fallback kicked in
- Orphan `pty-subprocess` processes after workspace delete

---

## Architecture

```
App (Renderer)
    ↓ tRPC
Electron Main
    ↓ Unix Socket
terminal-host daemon          ← ~/.superset[-dev]/
    ↓ stdin/stdout IPC
pty-subprocess (per session)  ← Owns the PTY
    ↓
shell (zsh/bash)
```

**Key insight**: Daemon persists across app restarts. Code changes require daemon restart.

---

## Known Issues

### node-pty `onExit` doesn't fire after `pty.kill(SIGTERM)`

**Symptom**: Subprocess stays alive, session stuck until 5s timeout.

**Solution** (implemented): Escalation watchdog in `handleKill()`:
- 0s: Send SIGTERM
- +2s: Escalate to SIGKILL if still alive
- +3s: Force exit if onExit still hasn't fired

**Files**: `src/main/terminal-host/pty-subprocess.ts`

---

## Adding Diagnostic Logging

Daemon logs go to `~/.superset-dev/daemon.log`. To add logging:

```typescript
// In pty-subprocess.ts (subprocess stderr → daemon.log)
console.error(`[pty-subprocess] your message`);

// In session.ts or terminal-host.ts (daemon stdout → daemon.log)  
console.log(`[Session ${id}] your message`);
```

Remember: **Kill daemon after code changes** to pick up new logging.
