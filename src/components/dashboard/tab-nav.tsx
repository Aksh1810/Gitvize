"use client";

import { DiagramTab } from "@/types";
import { DIAGRAM_TABS } from "@/lib/constants";
import { motion } from "framer-motion";
import { transitions } from "@/lib/motion";
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
}

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
    return (
        <div className="flex items-center gap-3 px-4 py-3 overflow-x-auto border-b border-white/10 bg-[#0b111f]/45">
            <div className="tab-track surface-neo-soft flex items-center gap-1 p-1">
                {DIAGRAM_TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg pro-focus-ring transition-colors ${
                                isActive
                                    ? "text-white"
                                    : "text-white/58 hover:text-white"
                            }`}
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="tab-pill"
                                    className="tab-pill pro-pill-active"
                                    transition={transitions.spring}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-2">
                                {iconMap[tab.icon]}
                                <span className="hidden sm:inline">{tab.label}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
