import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useState } from "react";
import { LuCopy } from "react-icons/lu";

function getModifierKeyLabel() {
	const isMac = navigator.platform.toLowerCase().includes("mac");
	return isMac ? "⌘" : "Ctrl+";
}

interface SelectionContextMenuProps<T extends HTMLElement> {
	children: ReactNode;
	selectAllContainerRef: RefObject<T | null>;
}

export function SelectionContextMenu<T extends HTMLElement>({
	children,
	selectAllContainerRef,
}: SelectionContextMenuProps<T>) {
	const [selectionText, setSelectionText] = useState("");
	const [linkHref, setLinkHref] = useState<string | null>(null);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setLinkHref(null);
			return;
		}

		const selection = window.getSelection();
		setSelectionText(selection?.toString() ?? "");
	};

	const handleContextMenuCapture = (event: ReactMouseEvent) => {
		const selection = window.getSelection();
		setSelectionText(selection?.toString() ?? "");

		const target = event.target;
		const anchor = target instanceof Element ? target.closest("a") : null;
		setLinkHref(anchor instanceof HTMLAnchorElement ? anchor.href : null);
	};

	const handleCopy = async () => {
		const selection = window.getSelection();
		const text = selection?.toString() ?? selectionText;
		if (!text) return;

		try {
			await navigator.clipboard.writeText(text);
		} catch {
			try {
				document.execCommand("copy");
			} catch {
				// Ignore; clipboard access may be restricted.
			}
		}
	};

	const handleCopyLinkAddress = async () => {
		if (!linkHref) return;
		try {
			await navigator.clipboard.writeText(linkHref);
		} catch {
			// Ignore; clipboard access may be restricted.
		}
	};

	const handleSelectAll = () => {
		const container = selectAllContainerRef.current;
		const selection = window.getSelection();
		if (!container || !selection) return;

		const range = document.createRange();
		range.selectNodeContents(container);
		selection.removeAllRanges();
		selection.addRange(range);
		setSelectionText(selection.toString());
	};

	const canCopy = selectionText.trim().length > 0;
	const modifierKeyLabel = getModifierKeyLabel();

	return (
		<ContextMenu onOpenChange={handleOpenChange}>
			<ContextMenuTrigger asChild onContextMenuCapture={handleContextMenuCapture}>
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem disabled={!canCopy} onSelect={handleCopy}>
					<LuCopy className="size-4" />
					Copy
					<ContextMenuShortcut>{`${modifierKeyLabel}C`}</ContextMenuShortcut>
				</ContextMenuItem>
				{linkHref && (
					<ContextMenuItem onSelect={handleCopyLinkAddress}>
						Copy Link Address
					</ContextMenuItem>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={handleSelectAll}>
					Select All
					<ContextMenuShortcut>{`${modifierKeyLabel}A`}</ContextMenuShortcut>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
