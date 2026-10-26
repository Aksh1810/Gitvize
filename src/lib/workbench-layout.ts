export function getWorkbenchPanelLayout(availableWidth: number, explorerOpen: boolean, preferredExplorer: number, preferredInspector: number) {
    const width = Math.max(0, Math.floor(availableWidth));
    const explorerOverlay = width < 640;
    const explorerMax = explorerOverlay ? width : Math.min(360, Math.max(0, width - 320));
    const explorerMin = Math.min(180, explorerMax);
    const explorerWidth = explorerOverlay ? width : Math.min(explorerMax, Math.max(explorerMin, preferredExplorer));
    const inspectorInlineMax = Math.max(0, width - (explorerOpen && !explorerOverlay ? explorerWidth : 0) - 320);
    const inspectorOverlay = explorerOverlay || inspectorInlineMax < 280;
    const inspectorMax = Math.min(700, inspectorOverlay ? width : inspectorInlineMax);
    const inspectorMin = Math.min(280, inspectorMax);
    const inspectorWidth = Math.min(inspectorMax, Math.max(inspectorMin, preferredInspector));

    return { explorerWidth, explorerMin, explorerMax, explorerOverlay, inspectorWidth, inspectorMin, inspectorMax, inspectorOverlay };
}
