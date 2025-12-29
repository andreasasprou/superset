# Plan: Add OpenCode Notifications via Superset Agent Hooks

## Goal
Enable Superset “needs attention” notifications for OpenCode by:
1) generating an `opencode` wrapper in `~/.superset*/bin` (self-healing like Claude/Codex), and
2) injecting a small OpenCode plugin via `OPENCODE_CONFIG_DIR` that calls the existing `hooks/notify.sh`.

## Constraints / Existing Behavior
- Superset’s notification pipeline only supports **`Stop`** and **`PermissionRequest`** (`apps/desktop/src/main/lib/notifications/server.ts`).
- `hooks/notify.sh` currently understands:
  - Claude-style JSON via `"hook_event_name":"Stop" | "PermissionRequest"`
  - Codex-style JSON via `"type":"agent-turn-complete"` → mapped to `Stop`
- Superset wrappers are **self-healing** and should include the `WRAPPER_MARKER` + runtime PATH scanning to find the “real” binary (avoid wrapper recursion).
- OpenCode plugins are **JS/TS modules** that export one or more plugin functions, each returning a **hooks object**:
  - `event: async ({ event }) => { ... }` (not an object keyed by event names)
  - `"permission.ask": async (permission, output) => { ... }` to detect when OpenCode will prompt the user

## Design
### Injection mechanism
- Use `OPENCODE_CONFIG_DIR` (documented by OpenCode) to point at a Superset-owned directory under `HOOKS_DIR`.
- Create a plugin file in `${OPENCODE_CONFIG_DIR}/plugin/` so OpenCode loads it automatically when the wrapper is used.

### Notification payload format
- Prefer **Claude-style** payloads (so we don’t need to change `notify.sh`):
  - `{"hook_event_name":"Stop"}`
  - `{"hook_event_name":"PermissionRequest"}`

### Event mapping (minimal, compatible with Superset)
| OpenCode signal | Superset eventType sent to `notify.sh` | Notes |
|---|---|---|
| `event.type === "session.idle"` | `Stop` | Agent finished / waiting for input |
| `"permission.ask"` and `output.status === "ask"` | `PermissionRequest` | User attention needed *before* user replies |
| `event.type === "session.error"` (optional) | `Stop` | Superset server doesn’t support `Error` today; treat as “needs attention” |

## Implementation Steps

### 1) Add OpenCode paths
**File:** `apps/desktop/src/main/lib/agent-setup/paths.ts`
```ts
export const OPENCODE_CONFIG_DIR = path.join(HOOKS_DIR, "opencode");
export const OPENCODE_PLUGIN_DIR = path.join(OPENCODE_CONFIG_DIR, "plugin");
```

### 2) Add OpenCode wrapper + plugin generation
**File:** `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`
Add:
- `getOpenCodeWrapperPath(): string` → `${BIN_DIR}/opencode`
- `getOpenCodePluginPath(): string` → `${OPENCODE_PLUGIN_DIR}/superset-notify.js`
- `buildOpenCodeWrapperScript(opencodeConfigDir: string): string`
  - Must include `WRAPPER_MARKER`
  - Must use the same PATH scanning as Claude/Codex wrappers (skip `~/.superset/bin` + `~/.superset-dev/bin`)
  - Must `export OPENCODE_CONFIG_DIR="..."` before `exec "$REAL_BIN" "$@"`
- `getOpenCodePluginContent(notifyPath: string): string`
  - Must include a plugin marker string (e.g. `// Superset opencode plugin v1`) for `ensure-agent-hooks` repair detection
  - Must implement OpenCode’s plugin API correctly (hooks object)

Suggested plugin shape:
```js
// Superset opencode plugin v1
export const SupersetNotifyPlugin = async ({ $ }) => {
  const notifyPath = "…"; // injected absolute path to hooks/notify.sh

  const send = async (hookEventName) => {
    const payload = JSON.stringify({ hook_event_name: hookEventName });
    try {
      await $`bash ${notifyPath} ${payload}`.quiet();
    } catch {
      // Best-effort: never break the agent
    }
  };

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") await send("Stop");
      if (event.type === "session.error") await send("Stop"); // optional
    },
    "permission.ask": async (_permission, output) => {
      if (output.status === "ask") await send("PermissionRequest");
    },
  };
};
```

Notes:
- Use Bun’s `$` interpolation so paths/args are safely escaped.
- Do **not** implement `permission.replied` for attention: it’s after the user responds.
- Do **not** send a new `Error` eventType unless we extend Superset’s server/UI first.

### 3) Wire into startup setup
**File:** `apps/desktop/src/main/lib/agent-setup/index.ts`
- Ensure `OPENCODE_PLUGIN_DIR` exists.
- Call both `createOpenCodePlugin()` and `createOpenCodeWrapper()` during `setupAgentHooks()`.

### 4) Wire into self-healing ensure/repair
**File:** `apps/desktop/src/main/lib/agent-setup/ensure-agent-hooks.ts`
- Ensure `OPENCODE_CONFIG_DIR` and `OPENCODE_PLUGIN_DIR` exist.
- Ensure plugin file exists and contains the plugin marker; rewrite if missing/outdated.
- Ensure `~/.superset*/bin/opencode` wrapper exists and contains `WRAPPER_MARKER`; rewrite if missing/outdated.

### 5) No changes to `notify-hook.ts` (by design)
Because the OpenCode plugin will call `notify.sh` with `"hook_event_name"`, `notify.sh` parsing remains unchanged.

## Files to Modify
| File | Changes |
|------|---------|
| `apps/desktop/src/main/lib/agent-setup/paths.ts` | Add `OPENCODE_CONFIG_DIR`, `OPENCODE_PLUGIN_DIR` |
| `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts` | Add OpenCode wrapper + plugin builders/creators |
| `apps/desktop/src/main/lib/agent-setup/index.ts` | Create dirs, call OpenCode setup on startup |
| `apps/desktop/src/main/lib/agent-setup/ensure-agent-hooks.ts` | Ensure/repair OpenCode wrapper + plugin |

## Resulting Directory Layout
```
~/.superset*/
├── bin/
│   └── opencode                      # Superset wrapper (self-healing)
└── hooks/
    ├── notify.sh                     # existing notification script
    └── opencode/
        └── plugin/
            └── superset-notify.js    # OpenCode plugin module
```

## Testing Checklist
1. Starting Superset creates `~/.superset*/bin/opencode` and `~/.superset*/hooks/opencode/plugin/superset-notify.js` (even if OpenCode isn’t installed).
2. Running `opencode --version` in a Superset terminal uses the wrapper and still prints the real OpenCode version.
3. OpenCode loads the plugin (sanity: no startup errors; optional: temporarily log once inside the plugin during development).
4. When OpenCode becomes idle, Superset receives an `AGENT_COMPLETE` event with `eventType=Stop`.
5. When OpenCode prompts for permission (ie `permission.ask` with `status === "ask"`), Superset receives `eventType=PermissionRequest`.
