"use client";

// ============================================================================
// Gitvize — Mermaid.js Interactive Diagram Component
// ============================================================================
// Renders Mermaid.js SVG with click-to-navigate (GitDiagram-style).
// Features: pan/zoom, dark theme, export PNG, copy Mermaid code.

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { Download, Copy, Check, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMermaidFitTransform } from "@/lib/mermaid-fit";

interface MermaidDiagramProps {
    code: string;
    onNodeClick?: (path: string) => void;
    onFallback?: () => void;
    viewControls?: ReactNode;
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

export default function MermaidDiagram({ code, onNodeClick: _onNodeClick, onFallback, viewControls }: MermaidDiagramProps) {
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
    const fitRafRef = useRef<number | null>(null);
    const manualViewRef = useRef(false);
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
        if (!container) return null;

        const svgEl = container.querySelector("svg") as SVGSVGElement | null;
        if (!svgEl || !container.clientWidth || !container.clientHeight) return null;
        const matrix = svgEl.getScreenCTM();
        if (!matrix) return null;
        const content = svgEl.parentElement!;
        const origin = content.getBoundingClientRect();
        const scale = new DOMMatrix(getComputedStyle(content).transform).a;
        if (!scale) return null;
        const box = svgEl.getBBox();
        // Screen CTM includes viewBox origins, letterboxing and CSS sizing; remove only our outer transform.
        const corners = [
            new DOMPoint(box.x, box.y), new DOMPoint(box.x + box.width, box.y),
            new DOMPoint(box.x, box.y + box.height), new DOMPoint(box.x + box.width, box.y + box.height),
        ].map(point => point.matrixTransform(matrix));
        const left = Math.min(...corners.map(point => point.x));
        const top = Math.min(...corners.map(point => point.y));
        const viewport = container.getBoundingClientRect();
        return getMermaidFitTransform({
            x: (left - origin.left) / scale,
            y: (top - origin.top) / scale,
            width: (Math.max(...corners.map(point => point.x)) - left) / scale,
            height: (Math.max(...corners.map(point => point.y)) - top) / scale,
        }, { width: viewport.width, height: viewport.height });
    }, []);

    const centerInitialView = useCallback(() => {
        const fit = computeFitTransform();
        if (!fit) return;
        viewTransformRef.current = fit;
        panOffsetRef.current = { x: 0, y: 0 };
        setViewTransform(fit);
        setPanOffset({ x: 0, y: 0 });
    }, [computeFitTransform]);

    const clearPendingFitFrames = useCallback(() => {
        if (fitRafRef.current !== null) cancelAnimationFrame(fitRafRef.current);
        fitRafRef.current = null;
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
                    const diagram = new DOMParser().parseFromString(svg, "text/html");
                    diagram.querySelectorAll<SVGElement>("[style]").forEach((element) => {
                        ["fill", "stroke", "color", "background", "background-color"].forEach((property) => element.style.removeProperty(property));
                    });
                    const themedSvg = diagram.querySelector("svg")!.outerHTML;
                    setSvgContent(themedSvg);
                    lastGoodSvgRef.current = themedSvg;
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
        manualViewRef.current = false;
    }, [svgContent]);

    useEffect(() => {
        if (isRendering || !svgContent || !containerRef.current) return;
        const container = containerRef.current;
        let cancelled = false;
        const scheduleFit = () => {
            if (manualViewRef.current || fitRafRef.current !== null) return;
            fitRafRef.current = requestAnimationFrame(() => {
                fitRafRef.current = null;
                if (!manualViewRef.current) centerInitialView();
            });
        };
        const observer = new ResizeObserver(scheduleFit);
        observer.observe(container);
        const svg = container.querySelector("svg");
        if (svg) observer.observe(svg);
        scheduleFit();
        document.fonts.ready.then(() => { if (!cancelled) scheduleFit(); });
        return () => {
            cancelled = true;
            observer.disconnect();
            clearPendingFitFrames();
        };
    }, [svgContent, isRendering, centerInitialView, clearPendingFitFrames]);

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

    const handleMouseDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panOriginRef.current = panOffset;
    }, [panOffset]);

    const handleMouseMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isPanning) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
            e.currentTarget.setPointerCapture(e.pointerId);
            manualViewRef.current = true;
            clearPendingFitFrames();
        }
        setPanOffset({
            x: panOriginRef.current.x + dx,
            y: panOriginRef.current.y + dy,
        });
    }, [isPanning, clearPendingFitFrames]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    const applyCenteredZoom = useCallback((nextScaleInput: number) => {
        const container = containerRef.current;
        if (!container) return;

        const currentView = viewTransformRef.current;
        const currentPan = panOffsetRef.current;

        const prevScale = currentView.scale;
        const nextScale = Math.max(0.01, Math.min(3, nextScaleInput));
        if (Math.abs(nextScale - prevScale) < 0.0001) return;
        manualViewRef.current = true;
        clearPendingFitFrames();

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
    }, [clearPendingFitFrames]);

    // Zoom handlers — accumulate wheel deltas in a ref and flush once per frame.
    const wheelAccumRef = useRef(0);
    const wheelRafRef = useRef<number | null>(null);
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        if (e.deltaY === 0) return;
        manualViewRef.current = true;
        clearPendingFitFrames();
        wheelAccumRef.current += e.deltaY > 0 ? -0.07 : 0.07;
        if (wheelRafRef.current !== null) return;
        wheelRafRef.current = requestAnimationFrame(() => {
            wheelRafRef.current = null;
            const delta = wheelAccumRef.current;
            wheelAccumRef.current = 0;
            if (delta === 0) return;
            applyCenteredZoom(viewTransformRef.current.scale + delta);
        });
    }, [applyCenteredZoom, clearPendingFitFrames]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => container.removeEventListener("wheel", handleWheel);
    }, [handleWheel, svgContent, isRendering, error]);

    const zoomIn = () => {
        applyCenteredZoom(viewTransformRef.current.scale + 0.12);
    };
    const zoomOut = () => {
        applyCenteredZoom(viewTransformRef.current.scale - 0.12);
    };

    const resetView = useCallback(() => {
        clearPendingFitFrames();
        if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
        wheelAccumRef.current = 0;
        manualViewRef.current = false;
        setIsPanning(false);
        centerInitialView();
        panOriginRef.current = { x: 0, y: 0 };
        panStartRef.current = { x: 0, y: 0 };
    }, [clearPendingFitFrames, centerInitialView]);

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
        const theme = getComputedStyle(containerRef.current!);
        const surface = theme.getPropertyValue("--atlas-surface").trim();
        const ink = theme.getPropertyValue("--atlas-ink").trim();
        const accent = theme.getPropertyValue("--atlas-blue").trim();
        const selected = theme.getPropertyValue("--atlas-selected").trim();
        const muted = theme.getPropertyValue("--atlas-muted").trim();
        svgEl.style.background = surface;
        styleEl.textContent = `
            * { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            svg .node :is(rect, circle, polygon, ellipse, path) { fill: ${selected} !important; stroke: ${accent} !important; }
            svg :is(.nodeLabel, .nodeLabel p, .cluster-label, .cluster-label p, .edgeLabel, .edgeLabel p) { color: ${ink} !important; }
            svg text { fill: ${ink} !important; }
            svg .cluster rect { fill: ${surface} !important; stroke: ${muted} !important; }
            svg :is(.flowchart-link, .edgePath path) { stroke: ${muted} !important; }
            svg marker path { fill: ${muted} !important; stroke: ${muted} !important; }
            svg :is(.edgeLabel, .edgeLabel p, .labelBkg, .edgeLabel .background) { background: ${surface} !important; fill: ${surface} !important; }
        `;
        styleEl.textContent = styleEl.textContent.replaceAll("svg ", `svg#${CSS.escape(svgEl.id)}#${CSS.escape(svgEl.id)} `);
        svgEl.appendChild(styleEl);

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
            <div className="atlas-architecture flex h-full min-h-0 flex-col overflow-hidden">
            {viewControls && <div className="architecture-toolbar">{viewControls}</div>}
            <div className="architecture-state" role="status">
                <div className="flex flex-col items-center gap-4">
                    <div className="loading-orbit" />
                    <p className="text-sm text-muted-foreground">
                        Generating architecture diagram...
                    </p>
                </div>
            </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="atlas-architecture flex h-full min-h-0 flex-col overflow-hidden">
            {viewControls && <div className="architecture-toolbar">{viewControls}</div>}
            <div className="architecture-state" role="alert">
                <div className="text-center max-w-md">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h3 className="text-lg font-medium text-foreground mb-2">
                        Diagram Render Error
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">{error}</p>

                    <Button
                        variant="outline"
                        onClick={() => {
                            setError(null);
                            setIsRendering(true);
                            setRetryKey((k) => k + 1);
                        }}
                        className="w-full mb-2"
                    >
                        Try Again
                    </Button>

                    {onFallback && (
                        <Button
                            variant="outline"
                            onClick={onFallback}
                            className="w-full mb-4"
                        >
                            Show Smart Diagram Instead
                        </Button>
                    )}

                    <details className="text-left">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                            View Mermaid Code
                        </summary>
                        <pre className="architecture-source mt-2 p-3 rounded-md text-xs overflow-auto max-h-40">
                            {code}
                        </pre>
                    </details>
                </div>
            </div>
            </div>
        );
    }

    return (
        <div className="atlas-architecture relative flex h-full min-h-0 w-full flex-col overflow-hidden diagram-dot-field">
            <div className="architecture-toolbar" role="toolbar" aria-label="Architecture controls">
                {viewControls}
                <div className="architecture-control-group" role="group" aria-label="Diagram view">
                <Button
                    aria-label="Zoom in on architecture"
                    variant="outline"
                    size="icon"
                    onClick={zoomIn}
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    aria-label="Zoom out of architecture"
                    variant="outline"
                    size="icon"
                    onClick={zoomOut}
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    aria-label="Fit architecture in view"
                    variant="outline"
                    size="icon"
                    onClick={resetView}
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
                </div>
                <div className="architecture-control-group" role="group" aria-label="Diagram export">
                <Button
                    variant="outline"
                    onClick={exportSVG}
                >
                    <Download className="h-4 w-4" />
                    SVG
                </Button>
                <Button
                    variant="outline"
                    onClick={copyMermaidCode}
                >
                    {copied ? (
                        <Check className="h-4 w-4" />
                    ) : (
                        <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copied!" : "Copy code"}
                </Button>
                </div>
                <output className="architecture-scale" aria-label="Architecture zoom level">
                    {Math.round(viewTransform.scale * 100)}%
                </output>
            </div>
            {showStaleWarning && (
                <div role="status" className="architecture-notice border-b border-border bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    Showing last valid diagram. Current Mermaid output has syntax issues.
                </div>
            )}

            {/* SVG Container */}
            <div
                ref={containerRef}
                className={`architecture-canvas relative min-h-0 flex-1 w-full ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
                onPointerDown={handleMouseDown}
                onPointerMove={handleMouseMove}
                onPointerUp={handleMouseUp}
                onPointerCancel={handleMouseUp}
                onPointerLeave={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) handleMouseUp(); }}
            >
                <div
                    className="absolute top-0 left-0"
                    style={{
                        transform: `translate(${viewTransform.x + panOffset.x}px, ${viewTransform.y + panOffset.y}px)`,
                        willChange: "transform",
                    }}
                >
                    <div
                        className="mermaid-container"
                        style={{
                            transform: `scale(${viewTransform.scale})`,
                            transformOrigin: "0 0",
                            willChange: "transform",
                        }}
                        dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                </div>
            </div>
        </div>
    );
}
