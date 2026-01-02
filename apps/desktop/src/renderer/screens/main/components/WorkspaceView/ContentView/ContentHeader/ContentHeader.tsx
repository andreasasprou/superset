import type { ReactNode } from "react";

interface ContentHeaderProps {
	/** Optional leading action (e.g., SidebarControl) */
	leadingAction?: ReactNode;
	/** Mode-specific header content (e.g., GroupStrip or file info) */
	children: ReactNode;
}

export function ContentHeader({ leadingAction, children }: ContentHeaderProps) {
	return (
		<div className="flex items-end bg-background shrink-0">
			{leadingAction && (
				<div className="flex items-center h-10 pl-2">{leadingAction}</div>
			)}
			{children}
		</div>
	);
}
