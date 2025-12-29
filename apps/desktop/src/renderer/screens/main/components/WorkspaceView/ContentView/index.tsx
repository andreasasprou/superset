import { trpc } from "renderer/lib/trpc";
import { useWorkspaceViewModeStore } from "renderer/stores/workspace-view-mode";
import { ChangesContent } from "./ChangesContent";
import { TabsContent } from "./TabsContent";

export function ContentView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;

	// Subscribe to the actual data, not just the getter function
	const viewModeByWorkspaceId = useWorkspaceViewModeStore(
		(s) => s.viewModeByWorkspaceId,
	);

	const viewMode = workspaceId
		? (viewModeByWorkspaceId[workspaceId] ?? "workbench")
		: "workbench";

	if (viewMode === "review") {
		return (
			<div className="h-full overflow-hidden bg-tertiary p-1">
				<div className="h-full bg-background rounded-lg overflow-hidden border border-border">
					<ChangesContent />
				</div>
			</div>
		);
	}

	return <TabsContent />;
}
