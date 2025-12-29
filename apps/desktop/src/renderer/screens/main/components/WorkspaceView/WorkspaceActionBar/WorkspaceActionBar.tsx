import { ViewModeToggle } from "./components/ViewModeToggle";
import { WorkspaceActionBarLeft } from "./components/WorkspaceActionBarLeft";
import { WorkspaceActionBarRight } from "./components/WorkspaceActionBarRight";

interface WorkspaceActionBarProps {
	worktreePath: string | undefined;
}

export function WorkspaceActionBar({ worktreePath }: WorkspaceActionBarProps) {
	if (!worktreePath) return null;

	return (
		<div className="px-2 py-1 h-9 w-full flex items-center text-xs shrink-0 select-none bg-tertiary">
			<div className="flex items-center gap-2 min-w-0">
				<WorkspaceActionBarLeft />
			</div>
			<div className="flex-1 flex justify-center">
				<ViewModeToggle />
			</div>
			<div className="flex items-center h-full">
				<WorkspaceActionBarRight worktreePath={worktreePath} />
			</div>
		</div>
	);
}
