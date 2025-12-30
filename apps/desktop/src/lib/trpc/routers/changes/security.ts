import { lstat, realpath } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	normalize,
	relative,
	sep,
} from "node:path";
import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

/** Type for worktree record returned from localDb */
export type WorktreeRecord = typeof worktrees.$inferSelect;

/**
 * Validates that a worktreePath exists in localDb.worktrees.
 * This prevents arbitrary filesystem/git access by ensuring the path
 * is a known, registered worktree.
 *
 * SECURITY: This is critical - without this check, a compromised renderer
 * could access arbitrary files/repos by passing worktreePath="/" or similar.
 *
 * @returns The worktree record from the database
 * @throws Error if worktreePath is not found in the database
 */
export function assertWorktreePathInDb(worktreePath: string): WorktreeRecord {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();

	if (!worktree) {
		throw new Error("Unauthorized: worktree path not found in database");
	}

	return worktree;
}

/**
 * Non-throwing version of assertWorktreePathInDb.
 * Returns true if the worktreePath exists in localDb.worktrees.
 */
export function validateWorktreePathInDb(worktreePath: string): boolean {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();
	return !!worktree;
}

// ============================================================================
// Path Validation Utilities
// ============================================================================

/**
 * Checks if a normalized path contains directory traversal patterns.
 * Uses segment-aware checks to avoid false positives on paths like "..foo/bar".
 */
export function containsPathTraversal(normalizedPath: string): boolean {
	// Check if path is exactly ".." or starts with "../" (or "..\\" on Windows)
	if (normalizedPath === ".." || normalizedPath.startsWith(`..${sep}`)) {
		return true;
	}
	// Check for "/../" or "\..\" anywhere in the path
	if (normalizedPath.includes(`${sep}..${sep}`)) {
		return true;
	}
	// Check if path ends with "/.." or "\.."
	if (normalizedPath.endsWith(`${sep}..`)) {
		return true;
	}
	return false;
}

/**
 * Checks if a relative path escapes outside its base directory.
 * Uses segment-aware checks for cross-platform compatibility.
 */
export function isPathOutsideBase(relativePath: string): boolean {
	if (isAbsolute(relativePath)) {
		return true;
	}
	// Segment-aware check: path is outside if it equals ".." or starts with "../"
	return (
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		// Also handle forward slashes on all platforms (relative() may use them)
		relativePath.startsWith("../")
	);
}

/** Result type for path validation */
export type PathValidationResult =
	| { valid: true; resolvedPath: string }
	| { valid: false; reason: "not-found" | "outside-worktree" };

/**
 * Validates that a file path is within the worktree and doesn't escape via symlinks.
 * Requires the file to exist (uses realpath).
 *
 * SECURITY: Use this before ANY filesystem operation on user-provided paths.
 */
export async function validatePathInWorktree(
	worktreePath: string,
	filePath: string,
): Promise<PathValidationResult> {
	// Reject absolute paths
	if (isAbsolute(filePath)) {
		return { valid: false, reason: "outside-worktree" };
	}

	// Normalize and check for traversal using segment-aware check
	const normalizedPath = normalize(filePath);
	if (containsPathTraversal(normalizedPath)) {
		return { valid: false, reason: "outside-worktree" };
	}

	const fullPath = join(worktreePath, normalizedPath);

	// Resolve symlinks and verify the real path is still within worktree
	try {
		const realWorktreePath = await realpath(worktreePath);
		const realFilePath = await realpath(fullPath);
		const relativePath = relative(realWorktreePath, realFilePath);

		// Use segment-aware check for relative path
		if (isPathOutsideBase(relativePath)) {
			return { valid: false, reason: "outside-worktree" };
		}

		return { valid: true, resolvedPath: realFilePath };
	} catch {
		// File doesn't exist
		return { valid: false, reason: "not-found" };
	}
}

/**
 * Validates that a file path is safe for writing within the worktree.
 * Does not require the file to exist (validates path structure and parent directory).
 * Also checks for symlink escape attacks.
 *
 * SECURITY: Use this before ANY write operation on user-provided paths.
 */
export async function validatePathForWrite(
	worktreePath: string,
	filePath: string,
): Promise<PathValidationResult> {
	// Reject absolute paths
	if (isAbsolute(filePath)) {
		return { valid: false, reason: "outside-worktree" };
	}

	// Normalize and check for traversal using segment-aware check
	const normalizedPath = normalize(filePath);
	if (containsPathTraversal(normalizedPath)) {
		return { valid: false, reason: "outside-worktree" };
	}

	const fullPath = join(worktreePath, normalizedPath);

	// Resolve the worktree path and verify our target path is within it
	try {
		const realWorktreePath = await realpath(worktreePath);

		// Check if target file exists and is a symlink - reject symlinks to prevent escape
		try {
			const stats = await lstat(fullPath);
			if (stats.isSymbolicLink()) {
				// File exists and is a symlink - verify target is within worktree
				const realFilePath = await realpath(fullPath);
				const relativePath = relative(realWorktreePath, realFilePath);
				if (isPathOutsideBase(relativePath)) {
					return { valid: false, reason: "outside-worktree" };
				}
				return { valid: true, resolvedPath: realFilePath };
			}
		} catch {
			// File doesn't exist yet - that's fine for writes, continue with parent check
		}

		// Resolve parent directory to catch symlink escapes in parent path
		const parentDir = dirname(fullPath);
		try {
			const realParentPath = await realpath(parentDir);
			const parentRelative = relative(realWorktreePath, realParentPath);
			if (isPathOutsideBase(parentRelative)) {
				return { valid: false, reason: "outside-worktree" };
			}
			// Construct final path using resolved parent + filename
			const fileName = basename(normalizedPath);
			const candidatePath = join(realParentPath, fileName);
			return { valid: true, resolvedPath: candidatePath };
		} catch {
			// Parent directory doesn't exist - fall back to path validation
			const candidatePath = join(realWorktreePath, normalizedPath);
			const relativePath = relative(realWorktreePath, candidatePath);
			if (isPathOutsideBase(relativePath)) {
				return { valid: false, reason: "outside-worktree" };
			}
			return { valid: true, resolvedPath: candidatePath };
		}
	} catch {
		// Worktree path doesn't exist or isn't accessible
		return { valid: false, reason: "not-found" };
	}
}
