/** @jest-environment node */
import { getWorkbenchPanelLayout } from "@/lib/workbench-layout";

it.each([
    [1280, true, 260, 440, false, false],
    [820, true, 260, 440, false, true],
    [820, false, 260, 440, false, false],
    [340, true, 340, 340, true, true],
    [0, true, 0, 0, true, true],
] as const)("fits panels into a %ipx workbench (explorer open: %s)", (width, open, explorer, inspector, explorerOverlay, inspectorOverlay) => {
    const layout = getWorkbenchPanelLayout(width, open, 260, 440);
    expect(layout).toMatchObject({ explorerWidth: explorer, inspectorWidth: inspector, explorerOverlay, inspectorOverlay });
    expect(layout.explorerMin).toBeLessThanOrEqual(layout.explorerWidth);
    expect(layout.explorerWidth).toBeLessThanOrEqual(layout.explorerMax);
    expect(layout.inspectorMin).toBeLessThanOrEqual(layout.inspectorWidth);
    expect(layout.inspectorWidth).toBeLessThanOrEqual(layout.inspectorMax);
});

it("reserves graph space when both panels fit inline", () => {
    const layout = getWorkbenchPanelLayout(1280, true, 360, 700);
    expect(layout).toMatchObject({ explorerWidth: 360, inspectorWidth: 600, inspectorOverlay: false });
    expect(1280 - layout.explorerWidth - layout.inspectorWidth).toBe(320);
});

it("restores preferred widths after temporary space constraints", () => {
    expect(getWorkbenchPanelLayout(650, true, 360, 700)).toMatchObject({ explorerWidth: 330, inspectorWidth: 650, inspectorOverlay: true });
    expect(getWorkbenchPanelLayout(1512, true, 360, 700)).toMatchObject({ explorerWidth: 360, inspectorWidth: 700, inspectorOverlay: false });
});
