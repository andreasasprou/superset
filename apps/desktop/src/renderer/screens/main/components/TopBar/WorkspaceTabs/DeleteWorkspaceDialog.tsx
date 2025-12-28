import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	useCloseWorkspace,
	useDeleteWorkspace,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";

interface DeleteWorkspaceDialogProps {
	workspaceId: string;
	workspaceName: string;
	workspaceType?: "worktree" | "branch";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	allWorkspaces: Array<{ id: string }>;
	activeWorkspaceId: string | null;
}

// Yield to ensure UI has repainted before deletion starts
const yieldToPaint = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});

export function DeleteWorkspaceDialog({
	workspaceId,
	workspaceName,
	workspaceType = "worktree",
	open,
	onOpenChange,
	allWorkspaces,
	activeWorkspaceId,
}: DeleteWorkspaceDialogProps) {
	const isBranch = workspaceType === "branch";
	const deleteWorkspace = useDeleteWorkspace();
	const closeWorkspace = useCloseWorkspace();
	const setActiveWorkspace = useSetActiveWorkspace();
	const utils = trpc.useUtils();

	const [isDeleting, setIsDeleting] = useState(false);
	const [isClosing, setIsClosing] = useState(false);

	const isActiveWorkspace = activeWorkspaceId === workspaceId;
	const isLastWorkspace = allWorkspaces.length === 1;

	// Find the next workspace to navigate to when deleting the active one
	const getNextWorkspaceId = (): string | null => {
		if (!isActiveWorkspace) return null;
		if (isLastWorkspace) return null;

		const currentIndex = allWorkspaces.findIndex((w) => w.id === workspaceId);

		// Handle edge case: workspace not found in list
		if (currentIndex === -1) {
			const firstOther = allWorkspaces.find((w) => w.id !== workspaceId);
			return firstOther?.id ?? null;
		}

		// Prefer next workspace, fall back to previous
		const nextIndex =
			currentIndex < allWorkspaces.length - 1
				? currentIndex + 1
				: currentIndex - 1;
		return allWorkspaces[nextIndex]?.id ?? null;
	};

	// Navigate away from the workspace before deletion to avoid showing terminal teardown
	const navigateAwayBeforeTeardown = async (): Promise<{
		didOptimisticClear: boolean;
		previousActive: ReturnType<typeof utils.workspaces.getActive.getData>;
	}> => {
		// Re-check active workspace from cache (avoid stale dialog snapshot)
		const currentActiveId = utils.workspaces.getActive.getData()?.id;
		const isCurrentlyActive = currentActiveId === workspaceId;

		if (!isCurrentlyActive) {
			return { didOptimisticClear: false, previousActive: undefined };
		}

		const nextWorkspaceId = getNextWorkspaceId();

		if (nextWorkspaceId) {
			try {
				await setActiveWorkspace.mutateAsync({ id: nextWorkspaceId });
				return { didOptimisticClear: false, previousActive: undefined };
			} catch {
				// Navigation failed - fall back to optimistic clear
				const previousActive = utils.workspaces.getActive.getData();
				utils.workspaces.getActive.setData(undefined, null);
				return { didOptimisticClear: true, previousActive };
			}
		} else {
			// Last workspace: optimistically clear active to show StartView immediately
			const previousActive = utils.workspaces.getActive.getData();
			utils.workspaces.getActive.setData(undefined, null);
			return { didOptimisticClear: true, previousActive };
		}
	};

	const { data: gitStatusData, isLoading: isLoadingGitStatus } =
		trpc.workspaces.canDelete.useQuery(
			{ id: workspaceId },
			{
				enabled: open,
				staleTime: Number.POSITIVE_INFINITY,
			},
		);

	const { data: terminalCountData } = trpc.workspaces.canDelete.useQuery(
		{ id: workspaceId, skipGitChecks: true },
		{
			enabled: open,
			refetchInterval: open ? 2000 : false,
		},
	);

	const canDeleteData = gitStatusData
		? {
				...gitStatusData,
				activeTerminalCount:
					terminalCountData?.activeTerminalCount ??
					gitStatusData.activeTerminalCount,
			}
		: terminalCountData;
	const isLoading = isLoadingGitStatus;

	const handleClose = async () => {
		setIsClosing(true);
		onOpenChange(false);

		const { didOptimisticClear, previousActive } =
			await navigateAwayBeforeTeardown();
		await yieldToPaint();

		try {
			const result = await closeWorkspace.mutateAsync({ id: workspaceId });

			await Promise.all([
				utils.workspaces.getAllGrouped.invalidate(),
				utils.workspaces.getActive.invalidate(),
			]);

			if (result.terminalWarning) {
				toast.warning("Terminal warning", {
					description: result.terminalWarning,
				});
			} else {
				toast.success("Workspace closed");
			}
		} catch (error) {
			if (didOptimisticClear && previousActive !== undefined) {
				utils.workspaces.getActive.setData(undefined, previousActive);
			}
			toast.error(
				error instanceof Error ? error.message : "Failed to close workspace",
			);
		} finally {
			setIsClosing(false);
		}
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		onOpenChange(false);

		const { didOptimisticClear, previousActive } =
			await navigateAwayBeforeTeardown();
		await yieldToPaint();

		try {
			const result = await deleteWorkspace.mutateAsync({ id: workspaceId });

			await Promise.all([
				utils.workspaces.getAllGrouped.invalidate(),
				utils.workspaces.getActive.invalidate(),
			]);

			if (result.terminalWarning) {
				toast.warning("Terminal warning", {
					description: result.terminalWarning,
				});
			} else {
				toast.success("Workspace deleted");
			}
		} catch (error) {
			if (didOptimisticClear && previousActive !== undefined) {
				utils.workspaces.getActive.setData(undefined, previousActive);
			}
			toast.error(
				error instanceof Error ? error.message : "Failed to delete workspace",
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const canDelete = canDeleteData?.canDelete ?? true;
	const reason = canDeleteData?.reason;
	const hasChanges = canDeleteData?.hasChanges ?? false;
	const hasUnpushedCommits = canDeleteData?.hasUnpushedCommits ?? false;
	const hasWarnings = hasChanges || hasUnpushedCommits;

	// For branch workspaces, use simplified dialog (only close option)
	if (isBranch) {
		return (
			<AlertDialog open={open} onOpenChange={onOpenChange}>
				<AlertDialogContent className="max-w-[340px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Close workspace "{workspaceName}"?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									This will close the workspace and kill any active terminals.
									Your branch and commits will remain in the repository.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => onOpenChange(false)}
							disabled={isClosing}
						>
							Cancel
						</Button>
						<Button
							variant="secondary"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleClose}
							disabled={isClosing}
						>
							{isClosing ? "Closing..." : "Close"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Remove workspace "{workspaceName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							{isLoading ? (
								"Checking status..."
							) : !canDelete ? (
								<span className="text-destructive">{reason}</span>
							) : (
								<span className="block">
									Close to hide from tabs (keeps files). Delete to permanently
									remove worktree from disk.
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{!isLoading && canDelete && hasWarnings && (
					<div className="px-4 pb-2">
						<div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
							{hasChanges && hasUnpushedCommits
								? "Has uncommitted changes and unpushed commits"
								: hasChanges
									? "Has uncommitted changes"
									: "Has unpushed commits"}
						</div>
					</div>
				)}

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
						disabled={isClosing || isDeleting}
					>
						Cancel
					</Button>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								variant="secondary"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleClose}
								disabled={isLoading || isClosing || isDeleting}
							>
								{isClosing ? "Closing..." : "Close"}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-[200px]">
							Hide from tabs. Worktree stays on disk and can be reopened later.
						</TooltipContent>
					</Tooltip>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
								disabled={!canDelete || isLoading || isClosing || isDeleting}
							>
								{isDeleting ? "Deleting..." : "Delete"}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-[200px]">
							Permanently delete workspace and git worktree from disk.
						</TooltipContent>
					</Tooltip>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
