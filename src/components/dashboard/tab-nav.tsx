"use client";

import { DiagramTab } from "@/types";
import { DIAGRAM_TABS } from "@/lib/constants";
import {
    Boxes,
    FolderTree,
    Users,
    GitBranch,
    Package,
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
    Boxes: <Boxes className="w-4 h-4" />,
    FolderTree: <FolderTree className="w-4 h-4" />,
    Users: <Users className="w-4 h-4" />,
    GitBranch: <GitBranch className="w-4 h-4" />,
    Package: <Package className="w-4 h-4" />,
};

interface TabNavProps {
    activeTab: DiagramTab;
    onTabChange: (tab: DiagramTab) => void;
}

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
    return (
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto border-b border-border/30">
            {DIAGRAM_TABS.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
            ${activeTab === tab.id
                            ? "bg-indigo/10 text-indigo border border-indigo/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        }
          `}
                >
                    {iconMap[tab.icon]}
                    <span className="hidden sm:inline">{tab.label}</span>
                </button>
            ))}
        </div>
    );
}
