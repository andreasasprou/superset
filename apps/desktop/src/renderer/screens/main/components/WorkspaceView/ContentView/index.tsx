import { trpc } from "renderer/lib/trpc";
import { useWorkspaceViewModeStore } from "renderer/stores/workspace-view-mode";
import { DEFAULT_NAVIGATION_STYLE } from "shared/constants";
import { SidebarControl } from "../../SidebarControl";
import { ChangesContent } from "./ChangesContent";
import { ContentHeader } from "./ContentHeader";
import { TabsContent } from "./TabsContent";
import { GroupStrip } from "./TabsContent/GroupStrip";

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

	// Get navigation style to conditionally show sidebar toggle
	const { data: navigationStyle } = trpc.settings.getNavigationStyle.useQuery();
	const isSidebarMode =
		(navigationStyle ?? DEFAULT_NAVIGATION_STYLE) === "sidebar";

	if (viewMode === "review") {
		return (
			<div className="h-full flex flex-col overflow-hidden">
				{isSidebarMode && (
					<ContentHeader leadingAction={<SidebarControl />}>
						{/* Review mode has no additional header content - FileHeader is inside ChangesContent */}
						<div />
					</ContentHeader>
				)}
				<div className="flex-1 overflow-hidden bg-tertiary p-1">
					<div className="h-full bg-background rounded-lg overflow-hidden border border-border">
						<ChangesContent />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<ContentHeader
				leadingAction={isSidebarMode ? <SidebarControl /> : undefined}
			>
				<GroupStrip />
			</ContentHeader>
			<TabsContent />
		</div>
	);
}
