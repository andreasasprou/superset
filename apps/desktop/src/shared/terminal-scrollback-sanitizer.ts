/**
 * Sanitize terminal scrollback before persisting/restoring.
 *
 * This module is shared between main and renderer processes.
 * Do NOT add any Node.js dependencies here.
 *
 * Why this exists:
 * - Some terminal "responses" (DA/DSR, mouse reports, etc.) can leak into the PTY output
 *   due to timing/tty echo state, and get captured into tmux/history scrollback.
 * - On restore, these show up as garbled text (e.g. `^[[>0;276;0c`).
 * - We strip only known non-display protocol artifacts while preserving styling (SGR, etc.).
 */

const ESC = "\x1b";

// Raw control sequence variants
const DA_RESPONSE_RAW = new RegExp(`${ESC}\\[[?>]?[0-9;]*c`, "g");
const CPR_RESPONSE_RAW = new RegExp(`${ESC}\\[[?>]?[0-9;]*R`, "g");
const MODE_REPORT_RAW = new RegExp(`${ESC}\\[[?>]?[0-9;]*\\$y`, "g");
const MOUSE_SGR_RAW = new RegExp(`${ESC}\\[<\\d+(?:;\\d+){2}[Mm]`, "g");

// tty "echoctl" caret-escaped variants (ESC becomes "^[" so CSI becomes "^[[")
const DA_RESPONSE_CARET = /\^\[\[[?>]?[0-9;]*c/g;
const CPR_RESPONSE_CARET = /\^\[\[[?>]?[0-9;]*R/g;
const MODE_REPORT_CARET = /\^\[\[[?>]?[0-9;]*\$y/g;
const MOUSE_SGR_CARET = /\^\[\[<\d+(?:;\d+){2}[Mm]/g;

// Heuristic cleanup for cases where only the payload leaks as text (seen with mouse reports).
// Require 2+ consecutive "Cb;Cx;CyM" segments to avoid eating legitimate output.
const MOUSE_SGR_PAYLOAD_RUN = /(?:\d{1,3};\d{1,3};\d{1,3}M){2,}/g;

// Heuristic cleanup for DA2 payload leakage (e.g. "0;276;0c") when the leading CSI is lost.
const DA_PAYLOAD = /(^|\s)[?>]?\d{1,4}(?:;\d{1,4}){1,4}c(?=$|\s)/g;

const PATTERNS: readonly RegExp[] = [
	DA_RESPONSE_RAW,
	DA_RESPONSE_CARET,
	CPR_RESPONSE_RAW,
	CPR_RESPONSE_CARET,
	MODE_REPORT_RAW,
	MODE_REPORT_CARET,
	MOUSE_SGR_RAW,
	MOUSE_SGR_CARET,
	MOUSE_SGR_PAYLOAD_RUN,
];

export function sanitizeTerminalScrollback(data: string): string {
	if (!data) return data;

	// Fast path: if there are no escape markers, no caret-escaped ESC, and no payload-ish
	// delimiters, there's nothing to do.
	if (!data.includes(ESC) && !data.includes("^[") && !data.includes(";")) {
		return data;
	}

	let sanitized = data;
	for (const pattern of PATTERNS) {
		sanitized = sanitized.replace(pattern, "");
	}

	// DA payload cleanup needs to preserve the leading whitespace capture.
	sanitized = sanitized.replace(DA_PAYLOAD, "$1");

	return sanitized;
}
