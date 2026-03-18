import type { Transition, Variants } from "framer-motion";

export const motionTokens = {
    duration: {
        fast: 0.2,
        base: 0.32,
        slow: 0.48,
    },
    ease: {
        standard: [0.22, 1, 0.36, 1] as const,
        smooth: [0.16, 1, 0.3, 1] as const,
    },
};

export const transitions = {
    base: {
        duration: motionTokens.duration.base,
        ease: motionTokens.ease.standard,
    } satisfies Transition,
    soft: {
        duration: motionTokens.duration.slow,
        ease: motionTokens.ease.smooth,
    } satisfies Transition,
    spring: {
        type: "spring",
        stiffness: 260,
        damping: 28,
        mass: 0.9,
    } satisfies Transition,
};

export const fadeSlideUp: Variants = {
    hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
    show: {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transition: transitions.soft,
    },
};

export const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            ...transitions.base,
            staggerChildren: 0.07,
            delayChildren: 0.04,
        },
    },
};
