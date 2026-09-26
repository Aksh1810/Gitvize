"use client";

import { DiagramTab } from "@/types";
import { DIAGRAM_TABS } from "@/lib/constants";
import {
    Boxes,
    Network,
    FolderTree,
    Users,
    GitBranch,
    Package,
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
    Boxes: <Boxes className="w-4 h-4" />,
    Network: <Network className="w-4 h-4" />,
    FolderTree: <FolderTree className="w-4 h-4" />,
    Users: <Users className="w-4 h-4" />,
    GitBranch: <GitBranch className="w-4 h-4" />,
    Package: <Package className="w-4 h-4" />,
};

interface TabNavProps {
    activeTab: DiagramTab;
    onTabChange: (tab: DiagramTab) => void;
    rightAction?: React.ReactNode;
}

export default function TabNav({ activeTab, onTabChange, rightAction }: TabNavProps) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2 overflow-x-auto border-b border-white/10 bg-[#0b111f]/80">
            <nav aria-label="Repository views" className="flex items-center gap-1 min-w-max">
                {DIAGRAM_TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onTabChange(tab.id)}
                            aria-current={isActive ? "page" : undefined}
                            className={`relative flex items-center gap-2 px-3 py-2 ui-body font-medium rounded-md pro-focus-ring transition-colors ${
                                isActive
                                    ? "bg-sky-300/12 text-sky-100 ring-1 ring-sky-300/35"
                                    : "text-white/65 hover:text-white hover:bg-white/5"
                            }`}
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {iconMap[tab.icon]}
                                <span>{tab.label}</span>
                            </span>
                        </button>
                    );
                })}
            </nav>
            {rightAction}
        </div>
    );
}
