type AttachTask = {
	paneId: string;
	priority: number;
	enqueuedAt: number;
	canceled: boolean;
	run: (done: () => void) => void;
};

const MAX_CONCURRENT_ATTACHES = 3;

let inFlight = 0;
const queue: AttachTask[] = [];
const pendingByPaneId = new Map<string, AttachTask>();

function pump(): void {
	while (inFlight < MAX_CONCURRENT_ATTACHES && queue.length > 0) {
		// Pick highest priority (lowest number), FIFO within same priority.
		queue.sort(
			(a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt,
		);
		const task = queue.shift();
		if (!task) return;
		if (task.canceled) continue;

		// If a newer task replaced this paneId, skip this stale one.
		const current = pendingByPaneId.get(task.paneId);
		if (current !== task) continue;

		inFlight++;
		task.run(() => {
			// Only clear if this task is still the current one for the paneId.
			if (pendingByPaneId.get(task.paneId) === task) {
				pendingByPaneId.delete(task.paneId);
			}
			inFlight = Math.max(0, inFlight - 1);
			pump();
		});
	}
}

export function scheduleTerminalAttach({
	paneId,
	priority,
	run,
}: {
	paneId: string;
	priority: number;
	run: (done: () => void) => void;
}): () => void {
	// Replace any existing pending task for this paneId.
	const existing = pendingByPaneId.get(paneId);
	if (existing) {
		existing.canceled = true;
		pendingByPaneId.delete(paneId);
	}

	const task: AttachTask = {
		paneId,
		priority,
		enqueuedAt: Date.now(),
		canceled: false,
		run,
	};

	pendingByPaneId.set(paneId, task);
	queue.push(task);
	pump();

	return () => {
		task.canceled = true;
		if (pendingByPaneId.get(paneId) === task) {
			pendingByPaneId.delete(paneId);
		}
	};
}
