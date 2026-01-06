import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { ResizableSidebar } from "../../../WorkspaceView/ResizableSidebar";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

/**
 * Check if a tab contains at least one terminal pane.
 * Used to determine which tabs need to stay mounted for persistence.
 */
function hasTerminalPane(tab: Tab, panes: Record<string, Pane>): boolean {
	const paneIds = extractPaneIdsFromLayout(tab.layout);
	return paneIds.some((paneId) => panes[paneId]?.type === "terminal");
}

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: terminalPersistence } =
		trpc.settings.getTerminalPersistence.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	// Get all tabs for current workspace (for fallback/empty check)
	const currentWorkspaceTabs = useMemo(() => {
		if (!activeWorkspaceId) return [];
		return allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId);
	}, [activeWorkspaceId, allTabs]);

	const tabToRender = useMemo(() => {
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeTabId, allTabs]);

	// When terminal persistence is enabled, keep terminal-containing tabs mounted
	// across workspace/tab switches. This prevents TUI white screen issues by
	// avoiding the unmount/remount cycle that requires complex reattach/rehydration.
	// Non-terminal tabs use normal unmount behavior to save memory.
	// Uses visibility:hidden (not display:none) to preserve xterm dimensions.
	if (terminalPersistence) {
		// Show empty view only if current workspace has no tabs
		if (currentWorkspaceTabs.length === 0) {
			return (
				<div className="flex-1 min-h-0 flex overflow-hidden">
					<div className="flex-1 min-w-0 overflow-hidden">
						<EmptyTabView />
					</div>
					<ResizableSidebar />
				</div>
			);
		}

		// Partition tabs: terminal tabs stay mounted, non-terminal tabs unmount when inactive
		const terminalTabs = allTabs.filter((tab) => hasTerminalPane(tab, panes));
		const activeNonTerminalTab =
			tabToRender && !hasTerminalPane(tabToRender, panes) ? tabToRender : null;

		return (
			<div className="flex-1 min-h-0 flex overflow-hidden">
				<div className="relative flex-1 min-w-0">
					{/* Terminal tabs: keep mounted with visibility toggle */}
					{terminalTabs.map((tab) => {
						const isVisible =
							tab.workspaceId === activeWorkspaceId && tab.id === activeTabId;

						return (
							<div
								key={tab.id}
								className="absolute inset-0"
								style={{
									visibility: isVisible ? "visible" : "hidden",
									pointerEvents: isVisible ? "auto" : "none",
								}}
							>
								<TabView tab={tab} panes={panes} />
							</div>
						);
					})}
					{/* Active non-terminal tab: render normally (unmounts when switching) */}
					{activeNonTerminalTab && (
						<div className="absolute inset-0">
							<TabView tab={activeNonTerminalTab} panes={panes} />
						</div>
					)}
				</div>
				<ResizableSidebar />
			</div>
		);
	}

	// Original behavior when persistence disabled: only render active tab
	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			<div className="flex-1 min-w-0 overflow-hidden">
				{tabToRender ? (
					<TabView tab={tabToRender} panes={panes} />
				) : (
					<EmptyTabView />
				)}
			</div>
			<ResizableSidebar />
		</div>
	);
}
