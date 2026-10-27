/** @jest-environment node */
import { getMermaidFitTransform } from "@/lib/mermaid-fit";

it("fits CSS-pixel content bounds once, enlarges small diagrams, and defers hidden containers", () => {
    const fit = getMermaidFitTransform({ x: -20, y: 10, width: 200, height: 100 }, { width: 800, height: 600 })!;
    expect(fit).toEqual({ scale: 3, x: 160, y: 120 });
    expect(fit.x + (-20 + 100) * fit.scale).toBe(400);
    expect(fit.y + (10 + 50) * fit.scale).toBe(300);
    expect(getMermaidFitTransform({ x: 8, y: 8, width: 2000, height: 1000 }, { width: 400, height: 300 }))
        .toEqual({ scale: 0.176, x: 22.592, y: 60.592 });
    expect(getMermaidFitTransform({ x: 0, y: 0, width: 200, height: 100 }, { width: 0, height: 600 })).toBeNull();
    expect(getMermaidFitTransform({ x: 0, y: 0, width: 0, height: 0 }, { width: 800, height: 600 })).toBeNull();
});
