"use client";

import { MotionConfig } from "framer-motion";
import { transitions } from "@/lib/motion";

interface AppMotionProviderProps {
    children: React.ReactNode;
}

export default function AppMotionProvider({ children }: AppMotionProviderProps) {
    return (
        <MotionConfig reducedMotion="user" transition={transitions.base}>
            {children}
        </MotionConfig>
    );
}
