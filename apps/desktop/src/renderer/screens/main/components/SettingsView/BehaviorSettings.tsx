import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { trpc } from "renderer/lib/trpc";

export function BehaviorSettings() {
	const { data: confirmOnQuit, isLoading } =
		trpc.settings.getConfirmOnQuit.useQuery();
	const setConfirmOnQuit = trpc.settings.setConfirmOnQuit.useMutation();

	const handleToggle = (enabled: boolean) => {
		setConfirmOnQuit.mutate({ enabled });
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Behavior</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure app behavior and preferences
				</p>
			</div>

			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label htmlFor="confirm-on-quit" className="text-sm font-medium">
							Confirm before quitting
						</Label>
						<p className="text-xs text-muted-foreground">
							Show a confirmation dialog when quitting the app
						</p>
					</div>
					<Switch
						id="confirm-on-quit"
						checked={confirmOnQuit ?? true}
						onCheckedChange={handleToggle}
						disabled={isLoading || setConfirmOnQuit.isPending}
					/>
				</div>
			</div>
		</div>
	);
}
