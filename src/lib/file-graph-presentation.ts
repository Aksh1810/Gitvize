export function showGraphLabel(type: string, primaryFolder: boolean, ratio: number, focused: boolean, neighbor: boolean) {
    if (focused || neighbor || type === "root") return true;
    if (type === "folder") return primaryFolder || ratio <= 0.55;
    return ratio <= (type === "symbol" ? 0.12 : 0.28);
}

type LabelBounds = { left: number; right: number; top: number; bottom: number };

export function hasGraphLabelPriority(bounds: LabelBounds, focus?: LabelBounds, focused = false) {
    return focused || !focus || bounds.right + 4 < focus.left || bounds.left - 4 > focus.right
        || bounds.bottom + 4 < focus.top || bounds.top - 4 > focus.bottom;
}

// Points use Sigma's viewport projection at camera ratio 1, preserving its rotation and normalization.
export function getGraphFit(
    points: Array<{ x: number; y: number; hidden?: boolean }>,
    viewport: { width: number; height: number },
    usable: { left: number; right: number; top: number; bottom: number },
) {
    const visible = points.filter(point => !point.hidden && Number.isFinite(point.x) && Number.isFinite(point.y));
    const availableWidth = usable.right - usable.left;
    const availableHeight = usable.bottom - usable.top;
    if (!visible.length || availableWidth < 32 || availableHeight < 32) return null;
    const padding = Math.min(32, availableWidth / 6, availableHeight / 6);
    const width = availableWidth - 2 * padding;
    const height = availableHeight - 2 * padding;
    const xs = visible.map(point => point.x);
    const ys = visible.map(point => point.y);
    const left = Math.min(...xs), right = Math.max(...xs);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const ratio = Math.max(0.15, Math.min(10, Math.max((right - left) / width, (bottom - top) / height)));
    return {
        x: (left + right) / 2 + (viewport.width - usable.left - usable.right) / 2 * ratio,
        y: (top + bottom) / 2 + (viewport.height - usable.top - usable.bottom) / 2 * ratio,
        ratio,
    };
}
