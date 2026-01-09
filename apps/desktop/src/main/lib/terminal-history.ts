/**
 * Stub terminal history module.
 *
 * Disk-based terminal history was removed from main (PR #684).
 * This stub provides no-op implementations to maintain API compatibility
 * with daemon-manager.ts. Phase 4 of the terminal persistence plan will
 * implement proper cold restore with hybrid storage (raw PTY log + checkpoints).
 *
 * TODO: Replace with proper hybrid storage implementation in Phase 4.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { SUPERSET_DIR_NAME } from "shared/constants";

const TERMINAL_HISTORY_DIR_NAME = "terminal-history";

export function getTerminalHistoryRootDir(): string {
	return join(homedir(), SUPERSET_DIR_NAME, TERMINAL_HISTORY_DIR_NAME);
}

/**
 * Stub HistoryWriter - no-op implementation.
 * Cold restore will be implemented properly in Phase 4.
 */
export class HistoryWriter {
	constructor(
		_workspaceId: string,
		_paneId: string,
		_cwd: string,
		_cols: number,
		_rows: number,
	) {
		// No-op
	}

	async init(_initialScrollback?: string): Promise<void> {
		// No-op - cold restore implementation pending Phase 4
	}

	async write(_data: string): Promise<void> {
		// No-op - cold restore implementation pending Phase 4
	}

	async flush(): Promise<void> {
		// No-op
	}

	async close(_exitCode?: number): Promise<void> {
		// No-op
	}

	async reinitialize(): Promise<void> {
		// No-op
	}

	async deleteHistory(): Promise<void> {
		// No-op
	}
}

/**
 * Stub HistoryReader - no-op implementation.
 * Cold restore will be implemented properly in Phase 4.
 */
export class HistoryReader {
	constructor(_workspaceId: string, _paneId: string) {
		// No-op
	}

	async readMetadata(): Promise<{
		cols: number;
		rows: number;
		cwd: string;
		endedAt?: string;
	} | null> {
		// No-op - return null to indicate no history available
		return null;
	}

	async readScrollback(): Promise<string | null> {
		// No-op - return null to indicate no scrollback available
		return null;
	}

	async exists(): Promise<boolean> {
		// No-op - return false to indicate no history exists
		return false;
	}

	cleanup(): void {
		// No-op
	}
}
