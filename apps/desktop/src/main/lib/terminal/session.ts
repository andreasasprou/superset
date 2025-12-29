import fs from "node:fs/promises";
import os from "node:os";
import * as pty from "node-pty";
import { parseCwd } from "shared/parse-cwd";
import { sanitizeTerminalScrollback } from "shared/terminal-scrollback-sanitizer";
import { getShellArgs } from "../agent-setup";
import { DataBatcher } from "../data-batcher";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../terminal-escape-filter";
import { HistoryReader, HistoryWriter } from "../terminal-history";
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env";
import { portManager } from "./port-manager";
import type { InternalCreateSessionParams, TerminalSession } from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
/** Max time to wait for agent hooks before running initial commands */
const AGENT_HOOKS_TIMEOUT_MS = 2000;

export async function recoverScrollback(
	existingScrollback: string | null,
	workspaceId: string,
	paneId: string,
): Promise<{ scrollback: string; wasRecovered: boolean; savedCwd?: string }> {
	const historyReader = new HistoryReader(workspaceId, paneId);
	const metadata = await historyReader.readMetadata();

	if (existingScrollback) {
		return {
			scrollback: sanitizeTerminalScrollback(existingScrollback),
			wasRecovered: true,
			savedCwd: metadata?.cwd,
		};
	}

	const history = await historyReader.read();

	if (history.scrollback) {
		const MAX_SCROLLBACK_CHARS = 500_000;
		const scrollback = sanitizeTerminalScrollback(
			history.scrollback.length > MAX_SCROLLBACK_CHARS
				? history.scrollback.slice(-MAX_SCROLLBACK_CHARS)
				: history.scrollback,
		);
		return {
			scrollback,
			wasRecovered: true,
			savedCwd: history.metadata?.cwd,
		};
	}

	return { scrollback: "", wasRecovered: false, savedCwd: metadata?.cwd };
}

function spawnPty(params: {
	shell: string;
	cols: number;
	rows: number;
	cwd: string;
	env: Record<string, string>;
}): pty.IPty {
	const { shell, cols, rows, cwd, env } = params;
	const shellArgs = getShellArgs(shell);

	return pty.spawn(shell, shellArgs, {
		name: "xterm-256color",
		cols,
		rows,
		cwd,
		env,
	});
}

export async function createSession(
	params: InternalCreateSessionParams,
	onData: (paneId: string, data: string) => void,
): Promise<TerminalSession> {
	const {
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
		cwd,
		cols,
		rows,
		existingScrollback,
		useFallbackShell = false,
	} = params;

	const shell = useFallbackShell ? FALLBACK_SHELL : getDefaultShell();
	const terminalCols = cols || DEFAULT_COLS;
	const terminalRows = rows || DEFAULT_ROWS;

	const env = buildTerminalEnv({
		shell,
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
	});

	const {
		scrollback: recoveredScrollback,
		wasRecovered,
		savedCwd,
	} = await recoverScrollback(existingScrollback, workspaceId, paneId);

	let workingDir = cwd ?? savedCwd ?? os.homedir();

	try {
		const stats = await fs.stat(workingDir);
		if (!stats.isDirectory()) {
			throw new Error("Not a directory");
		}
		await fs.readdir(workingDir);
	} catch {
		console.warn(
			`[session] CWD ${workingDir} not accessible, falling back to homedir`,
		);
		workingDir = os.homedir();
	}

	// Scan recovered scrollback for ports (verification will check if still listening)
	if (wasRecovered && recoveredScrollback) {
		portManager.scanOutput(recoveredScrollback, paneId, workspaceId);
	}

	const ptyProcess = spawnPty({
		shell,
		cols: terminalCols,
		rows: terminalRows,
		cwd: workingDir,
		env,
	});

	const historyWriter = new HistoryWriter(
		workspaceId,
		paneId,
		workingDir,
		terminalCols,
		terminalRows,
	);
	await historyWriter.init(recoveredScrollback || undefined);

	const dataBatcher = new DataBatcher((batchedData) => {
		onData(paneId, batchedData);
	});

	return {
		pty: ptyProcess,
		paneId,
		workspaceId,
		cwd: workingDir,
		cols: terminalCols,
		rows: terminalRows,
		lastActive: Date.now(),
		scrollback: recoveredScrollback,
		isAlive: true,
		wasRecovered,
		historyWriter,
		dataBatcher,
		shell,
		startTime: Date.now(),
		usedFallback: useFallbackShell,
	};
}

const OSC7_BUFFER_SIZE = 4096;

/**
 * Process a chunk of terminal data - shared between persistent and non-persistent sessions.
 * Handles scrollback, history writing, CWD tracking, and port scanning.
 */
export function processTerminalChunk(
	session: TerminalSession,
	data: string,
	osc7Buffer: string,
	onClearScrollback: () => Promise<void>,
): { newOsc7Buffer: string } {
	let dataToStore = data;

	if (containsClearScrollbackSequence(data)) {
		session.scrollback = "";
		void onClearScrollback().catch(() => {});
		dataToStore = extractContentAfterClear(data);
	}

	const sanitizedDataToStore = sanitizeTerminalScrollback(dataToStore);

	session.scrollback += sanitizedDataToStore;
	session.historyWriter?.write(sanitizedDataToStore);

	const newOsc7Buffer = (osc7Buffer + data).slice(-OSC7_BUFFER_SIZE);
	const newCwd = parseCwd(newOsc7Buffer);
	if (newCwd && newCwd !== session.cwd) {
		session.cwd = newCwd;
		session.historyWriter?.updateCwd(newCwd);
	}

	portManager.scanOutput(
		sanitizedDataToStore,
		session.paneId,
		session.workspaceId,
	);
	session.dataBatcher.write(data);

	return { newOsc7Buffer };
}

export function setupDataHandler(
	session: TerminalSession,
	initialCommands: string[] | undefined,
	wasRecovered: boolean,
	onHistoryReinit: () => Promise<void>,
	beforeInitialCommands?: Promise<void>,
): void {
	const initialCommandString =
		!wasRecovered && initialCommands && initialCommands.length > 0
			? `${initialCommands.join(" && ")}\n`
			: null;
	let commandsSent = false;
	let osc7Buffer = "";

	session.pty.onData((data) => {
		const result = processTerminalChunk(
			session,
			data,
			osc7Buffer,
			onHistoryReinit,
		);
		osc7Buffer = result.newOsc7Buffer;

		if (initialCommandString && !commandsSent) {
			commandsSent = true;
			setTimeout(() => {
				if (session.isAlive) {
					void (async () => {
						if (beforeInitialCommands) {
							const timeout = new Promise<void>((resolve) =>
								setTimeout(resolve, AGENT_HOOKS_TIMEOUT_MS),
							);
							await Promise.race([beforeInitialCommands, timeout]).catch(
								() => {},
							);
						}

						if (session.isAlive) {
							session.pty.write(initialCommandString);
						}
					})();
				}
			}, 100);
		}
	});
}

export async function closeSessionHistory(
	session: TerminalSession,
	exitCode?: number,
): Promise<void> {
	if (session.deleteHistoryOnExit) {
		if (session.historyWriter) {
			await session.historyWriter.close();
			session.historyWriter = undefined;
		}
		const historyReader = new HistoryReader(
			session.workspaceId,
			session.paneId,
		);
		await historyReader.cleanup();
		return;
	}

	if (session.historyWriter) {
		await session.historyWriter.close(exitCode);
		session.historyWriter = undefined;
	}
}

export async function closeSessionHistoryForDetach(
	session: TerminalSession,
): Promise<void> {
	if (session.historyWriter) {
		await session.historyWriter.closeForDetach();
		session.historyWriter = undefined;
	}
}

export async function reinitializeHistory(
	session: TerminalSession,
): Promise<void> {
	if (session.historyWriter) {
		await session.historyWriter.close();
		session.historyWriter = new HistoryWriter(
			session.workspaceId,
			session.paneId,
			session.cwd,
			session.cols,
			session.rows,
		);
		await session.historyWriter.init();
	}
}

export function flushSession(session: TerminalSession): void {
	session.dataBatcher.dispose();
}
