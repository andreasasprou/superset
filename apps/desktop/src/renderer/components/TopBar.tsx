import { Menu, MoreVertical, Plus, Search } from "lucide-react";
import { Button } from "./ui/button";

interface TopBarProps {
    isSidebarOpen: boolean;
    onOpenSidebar: () => void;
}

export function TopBar({ isSidebarOpen, onOpenSidebar }: TopBarProps) {
    return (
        <div
            className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 text-neutral-300 select-none"
            style={{ height: "48px", WebkitAppRegion: "drag" } as React.CSSProperties}
        >
            {/* Left section - Sidebar toggle */}
            <div
                className="flex items-center"
                style={
                    {
                        paddingLeft: isSidebarOpen ? "1rem" : "88px",
                        WebkitAppRegion: "no-drag",
                    } as React.CSSProperties
                }
            >
                {!isSidebarOpen && (
                    <Button variant="ghost" size="icon-sm" onClick={onOpenSidebar}>
                        <Menu size={16} />
                    </Button>
                )}
            </div>

            {/* Center section - Search/Address bar */}
            <div
                className="flex-1 max-w-2xl mx-4"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
                <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
                    <Search size={14} className="opacity-50" />
                    <input
                        type="text"
                        placeholder="Search or enter command..."
                        className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-neutral-500"
                    />
                </div>
            </div>

            {/* Right section - Actions */}
            <div
                className="flex items-center gap-1 pr-4"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
                <Button variant="ghost" size="icon-sm" className="hover:bg-neutral-800">
                    <Plus size={16} />
                </Button>
                <Button variant="ghost" size="icon-sm" className="hover:bg-neutral-800">
                    <MoreVertical size={16} />
                </Button>
            </div>
        </div>
    );
}
