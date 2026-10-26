/** @jest-environment node */
import { getGraphFit, hasGraphLabelPriority, showGraphLabel } from "@/lib/file-graph-presentation";

const viewport = { width: 800, height: 600 };
const usable = { left: 0, right: 800, top: 0, bottom: 600 };

it("gives the focused label room without hiding distant overview or neighbor labels", () => {
    const focused = { left: 185, right: 275, top: 465, bottom: 477 };
    expect(hasGraphLabelPriority(focused, focused, true)).toBe(true);
    expect(hasGraphLabelPriority({ left: 190, right: 240, top: 460, bottom: 472 }, focused)).toBe(false);
    expect(hasGraphLabelPriority({ left: 190, right: 270, top: 479, bottom: 491 }, focused)).toBe(false);
    expect(hasGraphLabelPriority({ left: 20, right: 100, top: 460, bottom: 472 }, focused)).toBe(true);
    expect(hasGraphLabelPriority({ left: 190, right: 270, top: 500, bottom: 512 }, focused)).toBe(true);
    expect(hasGraphLabelPriority(focused)).toBe(true);
});

it("keeps hierarchy labels at overview and reveals detail with zoom or focus", () => {
    expect(showGraphLabel("root", true, 1, false, false)).toBe(true);
    expect(showGraphLabel("folder", true, 1, false, false)).toBe(true);
    expect(showGraphLabel("folder", false, 1, false, false)).toBe(false);
    expect(showGraphLabel("folder", false, 0.4, false, false)).toBe(true);
    expect(showGraphLabel("file", false, 1, false, false)).toBe(false);
    expect(showGraphLabel("file", false, 0.2, false, false)).toBe(true);
    expect(showGraphLabel("symbol", false, 0.2, false, false)).toBe(false);
    expect(showGraphLabel("symbol", false, 0.1, false, false)).toBe(true);
    expect(showGraphLabel("file", false, 1, true, false)).toBe(true);
    expect(showGraphLabel("symbol", false, 1, false, true)).toBe(true);
});

it("fits visible bounds with padding instead of assuming a centered graph", () => {
    expect(getGraphFit([{ x: 100, y: 100 }, { x: 700, y: 500 }], viewport, usable)).toEqual({
        x: 400, y: 300, ratio: 600 / 736,
    });
    expect(getGraphFit([{ x: 100, y: 100 }, { x: 300, y: 200 }], viewport, usable)).toEqual({
        x: 200, y: 150, ratio: 200 / 736,
    });
});

it("centers in the canvas space left by an overlay", () => {
    const fit = getGraphFit([{ x: 100, y: 100 }, { x: 700, y: 500 }], viewport, { ...usable, right: 400 })!;
    expect(fit.ratio).toBeCloseTo(600 / 336);
    expect(fit.x).toBeCloseTo(400 + 200 * fit.ratio);
    expect(fit.y).toBe(300);
});

it("retains padding when a panel leaves a narrow usable strip", () => {
    const fit = getGraphFit([{ x: 100, y: 100 }, { x: 700, y: 500 }], viewport, { ...usable, right: 90 })!;
    expect(fit.ratio).toBe(10);
    expect(fit.x).toBe(400 + 355 * fit.ratio);
});

it("ignores hidden and invalid nodes, and handles empty and single-node graphs", () => {
    expect(getGraphFit([], viewport, usable)).toBeNull();
    expect(getGraphFit([{ x: 0, y: 0, hidden: true }], viewport, usable)).toBeNull();
    expect(getGraphFit([{ x: NaN, y: 1 }], viewport, usable)).toBeNull();
    expect(getGraphFit([{ x: 180, y: 240 }, { x: 9000, y: 9000, hidden: true }], viewport, usable)).toEqual({ x: 180, y: 240, ratio: 0.15 });
    expect(getGraphFit([{ x: 0, y: 0 }], viewport, { ...usable, right: 20 })).toBeNull();
});
