import { useState } from "react";

interface Tab {
	id: string;
	title: string;
	icon?: string;
	url?: string;
	type: "terminal" | "browser" | "folder";
}

interface SidebarProps {
	onTabSelect: (tabId: string) => void;
	activeTabId?: string;
}

export function Sidebar({ onTabSelect, activeTabId }: SidebarProps) {
	const [tabs, setTabs] = useState<Tab[]>([
		{ id: "1", title: "Terminal", type: "terminal" },
	]);
	const [favorites, setFavorites] = useState<Tab[]>([
		{ id: "fav-1", title: "Play", icon: "🎬", type: "folder", url: "" },
		{ id: "fav-2", title: "Links", icon: "🔗", type: "folder", url: "" },
	]);

	const handleNewTab = () => {
		const newTab: Tab = {
			id: Date.now().toString(),
			title: "New Tab",
			type: "terminal",
		};
		setTabs([...tabs, newTab]);
		onTabSelect(newTab.id);
	};

	const handleClearTabs = () => {
		setTabs([tabs[0]]); // Keep at least one tab
		onTabSelect(tabs[0].id);
	};

	return (
		<div className="flex flex-col h-full w-64 select-none bg-neutral-900 text-neutral-300 border-r border-neutral-800">
			{/* Top Section - Window Controls */}
			<div className="flex items-center justify-start gap-2 px-4 py-3 border-b border-neutral-800">
				<div className="flex gap-2">
					<div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
					<div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
					<div className="w-3 h-3 rounded-full bg-[#28C840]" />
				</div>
				<div className="flex-1" />
				<button className="transition-colors">
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M3 8H13"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
						<path
							d="M8 3V13"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			{/* Favorites Section */}
			<div className="px-3 py-2">
				{favorites.map((fav) => (
					<button
						key={fav.id}
						onClick={() => onTabSelect(fav.id)}
						className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
							activeTabId === fav.id ? "opacity-100" : "opacity-70 hover:opacity-100"
						}`}
					>
						<span className="text-lg">{fav.icon}</span>
						<span className="text-sm font-medium">{fav.title}</span>
					</button>
				))}
			</div>

			{/* Divider */}
			<div className="mx-3 border-t border-neutral-800 my-2" />

			{/* Clear Button */}
			<div className="px-3">
				<button
					onClick={handleClearTabs}
					className="w-full text-left px-3 py-1.5 text-xs opacity-70 hover:opacity-100 transition-colors flex items-center justify-between"
				>
					<span>↓ Clear</span>
				</button>
			</div>

			{/* Tabs Section - Scrollable */}
			<div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
				<button
					onClick={handleNewTab}
					className="w-full flex items-center gap-2 px-3 py-2 text-sm opacity-70 hover:opacity-100 rounded-lg transition-colors"
				>
					<span>+</span>
					<span>New Tab</span>
				</button>

				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabSelect(tab.id)}
						className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all group ${
							activeTabId === tab.id ? "opacity-100" : "opacity-70 hover:opacity-100"
						}`}
					>
						{tab.type === "terminal" && <span className="text-sm">▶︎</span>}
						{tab.type === "browser" && <span className="text-sm">🌐</span>}
						<span className="text-sm truncate flex-1 text-left">
							{tab.title}
						</span>
						{tabs.length > 1 && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									const newTabs = tabs.filter((t) => t.id !== tab.id);
									setTabs(newTabs);
									if (activeTabId === tab.id && newTabs.length > 0) {
										onTabSelect(newTabs[0].id);
									}
								}}
								className="opacity-0 group-hover:opacity-100 transition-opacity"
							>
								×
							</button>
						)}
					</button>
				))}

				{/* Quick Links */}
				<div className="pt-4 space-y-1">
					<button className="w-full flex items-center gap-2 px-3 py-2 text-sm opacity-70 hover:opacity-100 rounded-lg transition-colors">
						<span>⭐</span>
						<span className="truncate flex-1 text-left">
							Get Started | Nextra
						</span>
					</button>
					<button className="w-full flex items-center gap-2 px-3 py-2 text-sm opacity-70 hover:opacity-100 rounded-lg transition-colors">
						<span>📖</span>
						<span className="truncate flex-1 text-left">
							Parallel Agents - Conduct...
						</span>
					</button>
					<button className="w-full flex items-center gap-2 px-3 py-2 text-sm opacity-70 hover:opacity-100 rounded-lg transition-colors">
						<span>🔲</span>
						<span className="truncate flex-1 text-left">
							visualnewshub.com/realis...
						</span>
					</button>
				</div>
			</div>

			{/* Bottom Action Bar */}
			<div className="border-t border-neutral-800 px-3 py-3 flex items-center justify-around">
				<button className="opacity-70 hover:opacity-100 transition-colors p-2">
					<svg
						width="20"
						height="20"
						viewBox="0 0 20 20"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M10 4V16M4 10H16"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
				<button className="opacity-70 hover:opacity-100 transition-colors p-2">
					<svg
						width="20"
						height="20"
						viewBox="0 0 20 20"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<circle
							cx="10"
							cy="10"
							r="7"
							stroke="currentColor"
							strokeWidth="2"
						/>
						<circle cx="10" cy="10" r="2" fill="currentColor" />
					</svg>
				</button>
				<button className="opacity-70 hover:opacity-100 transition-colors p-2">
					<svg
						width="20"
						height="20"
						viewBox="0 0 20 20"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<rect
							x="4"
							y="6"
							width="12"
							height="10"
							rx="1"
							stroke="currentColor"
							strokeWidth="2"
						/>
						<path
							d="M6 6V5C6 4.44772 6.44772 4 7 4H13C13.5523 4 14 4.44772 14 5V6"
							stroke="currentColor"
							strokeWidth="2"
						/>
					</svg>
				</button>
				<button className="opacity-70 hover:opacity-100 transition-colors p-2">
					<svg
						width="20"
						height="20"
						viewBox="0 0 20 20"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<circle
							cx="10"
							cy="6"
							r="3"
							stroke="currentColor"
							strokeWidth="2"
						/>
						<path
							d="M4 16C4 13.7909 7.58172 12 12 12C16.4183 12 20 13.7909 20 16"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
				<button className="opacity-70 hover:opacity-100 transition-colors p-2">
					<svg
						width="20"
						height="20"
						viewBox="0 0 20 20"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M10 4V10M10 10V16M10 10H16M10 10H4"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}
