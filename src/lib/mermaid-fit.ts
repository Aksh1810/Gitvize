export function getMermaidFitTransform(
    bounds: { x: number; y: number; width: number; height: number },
    viewport: { width: number; height: number },
) {
    if (![bounds.x, bounds.y, bounds.width, bounds.height, viewport.width, viewport.height].every(Number.isFinite)
        || bounds.width <= 0 || bounds.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return null;
    const padding = Math.min(24, viewport.width / 8, viewport.height / 8);
    const scale = Math.min(3, (viewport.width - padding * 2) / bounds.width, (viewport.height - padding * 2) / bounds.height);
    return {
        scale,
        x: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
        y: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale,
    };
}
