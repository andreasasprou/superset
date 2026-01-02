import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceViewModeStore } from "renderer/stores/workspace-view-mode";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { ChangesView } from "./ChangesView";

export function Sidebar() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;

	// Subscribe to the actual data, not just the getter function
	const viewModeByWorkspaceId = useWorkspaceViewModeStore(
		(s) => s.viewModeByWorkspaceId,
	);

	const viewMode = workspaceId
		? (viewModeByWorkspaceId[workspaceId] ?? "workbench")
		: "workbench";

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	// In Workbench mode, open files in FileViewerPane
	const handleFileOpen =
		viewMode === "workbench" && workspaceId
			? (file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
					addFileViewerPane(workspaceId, {
						filePath: file.path,
						diffCategory: category,
						commitHash,
						oldPath: file.oldPath,
					});
				}
			: undefined;

	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<ChangesView onFileOpen={handleFileOpen} />
		</aside>
	);
}
