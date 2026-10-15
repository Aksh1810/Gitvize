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
        <aside className="workspace-nav">
            <p className="workspace-nav-label">EXPLORE</p>
            <nav aria-label="Repository views">
                {DIAGRAM_TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onTabChange(tab.id)}
                            aria-current={isActive ? "page" : undefined}
                            className="workspace-view"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {iconMap[tab.icon]}
                                <span>{tab.label}</span>
                            </span>
                        </button>
                    );
                })}
            </nav>
            <div className="workspace-nav-footer">{rightAction}</div>
        </aside>
    );
}
