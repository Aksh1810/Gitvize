"use client";

// ============================================================================
// GitViz — Mermaid.js Interactive Diagram Component
// ============================================================================
// Renders Mermaid.js SVG with click-to-navigate (GitDiagram-style).
// Features: pan/zoom, dark theme, export PNG, copy Mermaid code.

import { useEffect, useRef, useState, useCallback } from "react";
import { Download, Copy, Check, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MermaidDiagramProps {
    code: string;
    onNodeClick?: (path: string) => void;
    onFallback?: () => void;
}

function sanitizeMermaidForRender(raw: string): string {
    const withoutFences = raw
        .replace(/^```mermaid\n?/i, "")
        .replace(/^```\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();

    return withoutFences
        .split("\n")
        .map((line) => {
            const edgeWithColon = line.match(/^(\s*)(\S+)\s+(--+>|-\.->)\s+(\S+)\s*:\s*(.+)$/);
            if (!edgeWithColon) return line;
            const [, indent, from, arrow, to, label] = edgeWithColon;
            return `${indent}${from} ${arrow}|"${label.trim().replace(/"/g, "'")}"| ${to}`;
        })
        .join("\n");
}

export default function MermaidDiagram({ code, onNodeClick: _onNodeClick, onFallback }: MermaidDiagramProps) {
    void _onNodeClick;
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgContent, setSvgContent] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showStaleWarning, setShowStaleWarning] = useState(false);
    const [viewTransform, setViewTransform] = useState({ scale: 1, x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isRendering, setIsRendering] = useState(true);
    const [retryKey, setRetryKey] = useState(0);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panOriginRef = useRef({ x: 0, y: 0 });
    const fitRafRef = useRef<number[]>([]);
    const lastGoodSvgRef = useRef<string>("");
    const viewTransformRef = useRef(viewTransform);
    const panOffsetRef = useRef(panOffset);
    const isRenderingRef = useRef(isRendering);

    useEffect(() => {
        viewTransformRef.current = viewTransform;
    }, [viewTransform]);

    useEffect(() => {
        panOffsetRef.current = panOffset;
    }, [panOffset]);

    useEffect(() => {
        isRenderingRef.current = isRendering;
    }, [isRendering]);

    const computeFitTransform = useCallback(() => {
        const container = containerRef.current;
        if (!container) return { scale: 1, x: 0, y: 0 };

        const svgEl = container.querySelector("svg") as SVGSVGElement | null;
        if (!svgEl) return { scale: 1, x: 0, y: 0 };

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        if (!containerWidth || !containerHeight) return { scale: 1, x: 0, y: 0 };

        // Measure the SVG's natural CSS pixel size by un-applying our own scale transform.
        // getBoundingClientRect() returns post-transform screen pixels; dividing by the
        // current scale recovers the natural (unscaled) rendered pixel dimensions.
        // This is in the same unit space as containerWidth/containerHeight, unlike getBBox()
        // which returns SVG user-coordinate units that differ from CSS pixels.
        const currentScale = viewTransformRef.current.scale || 1;
        const rect = svgEl.getBoundingClientRect();
        const svgW = rect.width / currentScale;
        const svgH = rect.height / currentScale;

        if (!svgW || !svgH) return { scale: 1, x: 0, y: 0 };

        const paddingFactor = 0.92;
        const fitScale = Math.min(containerWidth / svgW, containerHeight / svgH) * paddingFactor;
        const clampedScale = Math.max(0.1, Math.min(3, fitScale));

        return {
            scale: clampedScale,
            x: containerWidth / 2 - (svgW * clampedScale) / 2,
            y: containerHeight / 2 - (svgH * clampedScale) / 2,
        };
    }, []);

    const centerInitialView = useCallback(() => {
        setViewTransform(computeFitTransform());
        setPanOffset({ x: 0, y: 0 });
    }, [computeFitTransform]);

    const clearPendingFitFrames = useCallback(() => {
        for (const rafId of fitRafRef.current) {
            cancelAnimationFrame(rafId);
        }
        fitRafRef.current = [];
    }, []);



    // 30-second frontend safety net: if mermaid.render() hangs, surface an error.
    useEffect(() => {
        if (!code) return;
        const timer = window.setTimeout(() => {
            if (isRenderingRef.current) {
                setIsRendering(false);
                setError("Architecture diagram timed out. Please try again.");
            }
        }, 30_000);
        return () => window.clearTimeout(timer);
    }, [code]);

    // Render Mermaid diagram
    useEffect(() => {
        if (!code) return;

        let cancelled = false;
        const debounceTimer = window.setTimeout(async () => {
            setIsRendering(true);
            setShowStaleWarning(false);
            setError(null);

            try {
                // Dynamic import — mermaid is client-only
                const mermaid = (await import("mermaid")).default;

                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                    securityLevel: "strict",
                    flowchart: {
                        useMaxWidth: false,
                        htmlLabels: false,
                        curve: "basis",
                        padding: 24,
                        nodeSpacing: 60,
                        rankSpacing: 80,
                        wrappingWidth: 200,
                    },
                    themeVariables: {
                        primaryColor: "#7c3aed",
                        primaryTextColor: "#e5e7eb",
                        primaryBorderColor: "#6d28d9",
                        lineColor: "#4b5563",
                        secondaryColor: "#1f2937",
                        tertiaryColor: "#111827",
                        background: "transparent",
                        mainBkg: "#1e1b4b",
                        nodeBorder: "#6d28d9",
                        clusterBkg: "transparent",
                        clusterBorder: "#374151",
                        titleColor: "#e5e7eb",
                        edgeLabelBackground: "#1f2937",
                        nodeTextColor: "#e5e7eb",
                    },
                });

                const uniqueId = `mermaid-${Date.now()}`;
                const sanitizedCode = sanitizeMermaidForRender(code);
                const { svg } = await Promise.race([
                    mermaid.render(uniqueId, sanitizedCode),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("Diagram render timed out")), 15_000)
                    ),
                ]);

                if (!cancelled) {
                    setSvgContent(svg);
                    lastGoodSvgRef.current = svg;
                    setIsRendering(false);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("Mermaid render error:", err);

                    if (lastGoodSvgRef.current) {
                        setSvgContent(lastGoodSvgRef.current);
                        setShowStaleWarning(true);
                        setError(null);
                    } else {
                        setError(
                            err instanceof Error
                                ? err.message
                                : "Failed to render diagram"
                        );
                    }
                    setIsRendering(false);
                }
            }
        }, 120);

        return () => {
            cancelled = true;
            window.clearTimeout(debounceTimer);
        };
    }, [code, retryKey]);

    useEffect(() => {
        if (!svgContent) return;
        let raf2: number | null = null;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                centerInitialView();
            });
        });

        // A second pass catches late font/layout settling from Mermaid SVG.
        const timeoutId = window.setTimeout(() => {
            centerInitialView();
        }, 180);

        return () => {
            cancelAnimationFrame(raf1);
            if (typeof raf2 === "number") {
                cancelAnimationFrame(raf2);
            }
            window.clearTimeout(timeoutId);
        };
    }, [svgContent, centerInitialView]);

    useEffect(() => {
        if (!svgContent || !containerRef.current) return;
        const container = containerRef.current;
        // Track whether the container was previously dimensionless (e.g. hidden tab).
        let wasDimensionless = container.clientWidth === 0 || container.clientHeight === 0;

        const observer = new ResizeObserver(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w === 0 || h === 0) {
                wasDimensionless = true;
                return;
            }
            if (wasDimensionless) {
                // Tab just became visible — always fit.
                wasDimensionless = false;
                setViewTransform(computeFitTransform());
                setPanOffset({ x: 0, y: 0 });
                panOriginRef.current = { x: 0, y: 0 };
            } else if (Math.abs(panOffsetRef.current.x) < 1 && Math.abs(panOffsetRef.current.y) < 1) {
                // Window resize while visible and user hasn't panned away.
                setViewTransform(computeFitTransform());
                setPanOffset({ x: 0, y: 0 });
            }
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [svgContent, computeFitTransform]);

    useEffect(() => {
        return () => {
            clearPendingFitFrames();
            if (wheelRafRef.current !== null) {
                cancelAnimationFrame(wheelRafRef.current);
                wheelRafRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panOriginRef.current = panOffset;
    }, [panOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPanOffset({
            x: panOriginRef.current.x + dx,
            y: panOriginRef.current.y + dy,
        });
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    const applyCenteredZoom = useCallback((nextScaleInput: number) => {
        const container = containerRef.current;
        if (!container) return;

        const currentView = viewTransformRef.current;
        const currentPan = panOffsetRef.current;

        const prevScale = Math.max(0.1, currentView.scale);
        const nextScale = Math.max(0.1, Math.min(3, nextScaleInput));
        if (Math.abs(nextScale - prevScale) < 0.0001) return;

        const anchorX = container.clientWidth / 2;
        const anchorY = container.clientHeight / 2;

        const totalX = currentView.x + currentPan.x;
        const totalY = currentView.y + currentPan.y;

        const worldX = (anchorX - totalX) / prevScale;
        const worldY = (anchorY - totalY) / prevScale;

        const newTotalX = anchorX - worldX * nextScale;
        const newTotalY = anchorY - worldY * nextScale;

        setViewTransform((prev) => ({ ...prev, scale: nextScale }));
        setPanOffset({
            x: newTotalX - currentView.x,
            y: newTotalY - currentView.y,
        });
    }, []);

    // Zoom handlers — accumulate wheel deltas in a ref and flush once per frame.
    const wheelAccumRef = useRef(0);
    const wheelRafRef = useRef<number | null>(null);
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        wheelAccumRef.current += e.deltaY > 0 ? -0.07 : 0.07;
        if (wheelRafRef.current !== null) return;
        wheelRafRef.current = requestAnimationFrame(() => {
            wheelRafRef.current = null;
            const delta = wheelAccumRef.current;
            wheelAccumRef.current = 0;
            if (delta === 0) return;
            applyCenteredZoom(viewTransformRef.current.scale + delta);
        });
    }, [applyCenteredZoom]);

    const zoomIn = () => {
        applyCenteredZoom(viewTransformRef.current.scale + 0.12);
    };
    const zoomOut = () => {
        applyCenteredZoom(viewTransformRef.current.scale - 0.12);
    };

    const resetView = useCallback(() => {
        clearPendingFitFrames();
        setIsPanning(false);
        const applyFit = () => {
            setViewTransform(computeFitTransform());
            setPanOffset({ x: 0, y: 0 });
        };

        applyFit();

        // Run a couple of post-layout passes to match late SVG/font settling.
        const raf1 = requestAnimationFrame(() => {
            applyFit();
            const raf2 = requestAnimationFrame(() => {
                applyFit();
            });
            fitRafRef.current.push(raf2);
        });
        fitRafRef.current.push(raf1);

        setPanOffset({ x: 0, y: 0 });
        panOriginRef.current = { x: 0, y: 0 };
        panStartRef.current = { x: 0, y: 0 };
    }, [clearPendingFitFrames, computeFitTransform]);

    // Export SVG
    const exportSVG = useCallback(async () => {
        if (!svgContent) return;

        const liveSvg = containerRef.current?.querySelector("svg") as SVGSVGElement | null;
        const svgEl = liveSvg?.cloneNode(true) as SVGSVGElement | null;
        if (!svgEl) return;

        let bbox: DOMRect | null = null;
        try {
            const rawBBox = liveSvg?.getBBox();
            if (rawBBox) {
                bbox = new DOMRect(rawBBox.x, rawBBox.y, rawBBox.width, rawBBox.height);
            }
        } catch {
            // Ignore
        }

        const padding = 24;
        const viewX = (bbox?.x ?? 0) - padding;
        const viewY = (bbox?.y ?? 0) - padding;
        const viewWidth = Math.max(1, (bbox?.width ?? 1200) + padding * 2);
        const viewHeight = Math.max(1, (bbox?.height ?? 800) + padding * 2);

        svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svgEl.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        svgEl.setAttribute("viewBox", `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);
        svgEl.setAttribute("width", String(Math.round(viewWidth)));
        svgEl.setAttribute("height", String(Math.round(viewHeight)));

        // Add CSS styles inline to preserve colors usually provided by the webpage
        const styleEl = document.createElement("style");
        styleEl.textContent = `
            * { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            .node rect, .node circle, .node polygon { fill: #1e293b; stroke: #818cf8; stroke-width: 1.5px; }
            .node .label { color: #f8fafc; font-size: 14px; }
            .edgePath path { stroke: #475569; stroke-width: 1.5px; }
            .edgeLabel { background-color: #0f172a; color: #cbd5e1; padding: 2px 4px; border-radius: 4px; }
        `;
        svgEl.insertBefore(styleEl, svgEl.firstChild);

        const serializedSvg = new XMLSerializer().serializeToString(svgEl);
        const svgBlob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" });
        const blobUrl = URL.createObjectURL(svgBlob);
        
        const link = document.createElement("a");
        link.download = "gitvize-architecture.svg";
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    }, [svgContent]);

    // Copy Mermaid code
    const copyMermaidCode = useCallback(async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [code]);

    // Loading state
    if (isRendering) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="loading-orbit" />
                    <p className="text-sm text-muted-foreground">
                        Generating architecture diagram...
                    </p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h3 className="text-lg font-medium text-white mb-2">
                        Diagram Render Error
                    </h3>
                    <p className="text-sm text-gray-400 mb-4">{error}</p>

                    <Button
                        variant="outline"
                        onClick={() => {
                            setError(null);
                            setIsRendering(true);
                            setRetryKey((k) => k + 1);
                        }}
                        className="w-full mb-2 bg-indigo-900/40 border-indigo-500/30 hover:bg-indigo-800/50 text-white"
                    >
                        Try Again
                    </Button>

                    {onFallback && (
                        <Button
                            variant="outline"
                            onClick={onFallback}
                            className="w-full mb-4 bg-slate-900 border-white/10 hover:bg-slate-800 text-white"
                        >
                            Show Smart Diagram Instead
                        </Button>
                    )}

                    <details className="text-left">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                            View Mermaid Code
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-900 rounded-lg text-xs text-gray-400 overflow-auto max-h-40">
                            {code}
                        </pre>
                    </details>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full overflow-hidden diagram-dot-field">
            {showStaleWarning && (
                <div className="absolute top-4 right-4 z-20 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 backdrop-blur-sm">
                    Showing last valid diagram. Current Mermaid output has syntax issues.
                </div>
            )}
            {/* Controls — positioned on the LEFT to avoid overlap with parent's "Generate Premium Diagram" button on the right */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={zoomIn}
                    className="bg-white/5 border-white/10 hover:bg-white/10 backdrop-blur-sm"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={zoomOut}
                    className="bg-white/5 border-white/10 hover:bg-white/10 backdrop-blur-sm"
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={resetView}
                    className="bg-white/5 border-white/10 hover:bg-white/10 backdrop-blur-sm"
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-white/10" />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={exportSVG}
                    className="bg-white/5 border-white/10 hover:bg-white/10 backdrop-blur-sm"
                >
                    <Download className="h-4 w-4 mr-1" />
                    SVG
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={copyMermaidCode}
                    className="bg-white/5 border-white/10 hover:bg-white/10 backdrop-blur-sm"
                >
                    {copied ? (
                        <Check className="h-4 w-4 mr-1 text-green-400" />
                    ) : (
                        <Copy className="h-4 w-4 mr-1" />
                    )}
                    {copied ? "Copied!" : "Code"}
                </Button>
            </div>

            {/* Scale indicator */}
            <div className="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                <span className="text-xs text-muted-foreground">
                    {Math.round(viewTransform.scale * 100)}%
                </span>
            </div>

            {/* SVG Container */}
            <div
                ref={containerRef}
                className={`relative h-full w-full ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <div
                    className="absolute top-0 left-0"
                    style={{
                        transform: `translate(${viewTransform.x + panOffset.x}px, ${viewTransform.y + panOffset.y}px)`,
                        transition: isPanning ? "none" : "transform 0.25s ease-out",
                        willChange: "transform",
                    }}
                >
                    <div
                        className="mermaid-container"
                        style={{
                            transform: `scale(${viewTransform.scale})`,
                            transformOrigin: "0 0",
                            transition: isPanning ? "none" : "transform 0.25s ease-out",
                            willChange: "transform",
                        }}
                        dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                </div>
            </div>
        </div>
    );
}
