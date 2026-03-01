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
}

export default function MermaidDiagram({ code, onNodeClick }: MermaidDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgContent, setSvgContent] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isRendering, setIsRendering] = useState(true);

    // Render Mermaid diagram
    useEffect(() => {
        if (!code) return;

        let cancelled = false;

        async function renderMermaid() {
            setIsRendering(true);
            setError(null);

            try {
                // Dynamic import — mermaid is client-only
                const mermaid = (await import("mermaid")).default;

                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                    securityLevel: "loose", // Required for click events (GitDiagram approach)
                    flowchart: {
                        useMaxWidth: false,
                        htmlLabels: true,
                        curve: "basis",
                        padding: 16,
                        nodeSpacing: 30,
                        rankSpacing: 40,
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
                const { svg } = await mermaid.render(uniqueId, code);

                if (!cancelled) {
                    // Set HTML content
                    setSvgContent(svg);
                    setIsRendering(false);

                    // Add drag logic after a short delay to ensure DOM is updated
                    setTimeout(() => {
                        const container = containerRef.current;
                        if (!container) return;

                        const svgElement = container.querySelector("svg");
                        if (!svgElement) return;

                        const nodes = svgElement.querySelectorAll(".node");
                        let draggedNode: SVGGElement | null = null;
                        let startPoint = { x: 0, y: 0 };
                        let startTransform = { x: 0, y: 0 };

                        // Prevent SVG default drag behavior
                        svgElement.addEventListener("dragstart", e => e.preventDefault());

                        nodes.forEach((node) => {
                            const gNode = node as SVGGElement;
                            gNode.style.cursor = "grab";

                            gNode.addEventListener("mousedown", (e) => {
                                // Stop propagation so canvas panning doesn't trigger
                                e.stopPropagation();
                                e.preventDefault();

                                draggedNode = gNode;
                                draggedNode.style.cursor = "grabbing";

                                // Get current transform
                                const transform = draggedNode.getAttribute("transform");
                                if (transform) {
                                    const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
                                    if (match) {
                                        startTransform = {
                                            x: parseFloat(match[1]),
                                            y: parseFloat(match[2])
                                        };
                                    }
                                }

                                // We need to account for scale/zoom
                                startPoint = { x: e.clientX, y: e.clientY };

                                // To make dragging smooth, append node to end of SVG to bring it to front
                                draggedNode.parentNode?.appendChild(draggedNode);
                            });
                        });

                        // Attach move and up to the window/SVG so we don't lose it if moving fast
                        svgElement.addEventListener("mousemove", (e) => {
                            if (!draggedNode) return;

                            // Account for scale from parent container
                            const currentScale = scale; // Using the react state is tricky inside a closure here if it changes, 
                            // But since the zoom handlers re-render the component, we might want to calculate the actual scale dynamically or read from a ref.
                            // Actually, let's just get the bounding rect scale.
                            const rect = svgElement.getBoundingClientRect();
                            const viewBox = svgElement.viewBox.baseVal;

                            // Calculate scale factor between screen pixels and viewBox pixels
                            const scaleX = viewBox.width / rect.width;
                            const scaleY = viewBox.height / rect.height;

                            const dx = (e.clientX - startPoint.x) * scaleX;
                            const dy = (e.clientY - startPoint.y) * scaleY;

                            const newX = startTransform.x + dx;
                            const newY = startTransform.y + dy;

                            draggedNode.setAttribute("transform", `translate(${newX},${newY})`);
                        });

                        window.addEventListener("mouseup", () => {
                            if (draggedNode) {
                                draggedNode.style.cursor = "grab";
                                draggedNode = null;
                            }
                        });

                    }, 100);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("Mermaid render error:", err);
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to render diagram"
                    );
                    setIsRendering(false);
                }
            }
        }

        renderMermaid();

        return () => {
            cancelled = true;
        };
    }, [code]);

    // Pan handlers
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        },
        [position]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        },
        [isDragging, dragStart]
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Zoom handlers
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setScale(prev => {
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            return Math.max(0.2, Math.min(3, prev + delta));
        });
    }, []);

    const zoomIn = () => setScale(prev => Math.min(3, prev + 0.2));
    const zoomOut = () => setScale(prev => Math.max(0.2, prev - 0.2));
    const resetView = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    // Export PNG
    const exportPNG = useCallback(async () => {
        if (!svgContent) return;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const img = new Image();
        const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;
            ctx.scale(2, 2);
            ctx.fillStyle = "#0f0a1e";
            ctx.fillRect(0, 0, img.width, img.height);
            ctx.drawImage(img, 0, 0);

            const link = document.createElement("a");
            link.download = "gitviz-architecture.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
            URL.revokeObjectURL(url);
        };
        img.src = url;
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
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-2 border-violet-500/20" />
                        <div className="absolute inset-0 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                    </div>
                    <p className="text-sm text-gray-400 animate-pulse">
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
        <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#0f0a1e] to-[#0a0612]">
            {/* Controls */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={zoomIn}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={zoomOut}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={resetView}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-gray-700" />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={exportPNG}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
                >
                    <Download className="h-4 w-4 mr-1" />
                    PNG
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={copyMermaidCode}
                    className="bg-gray-900/80 border-gray-700 hover:bg-gray-800 backdrop-blur-sm"
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
            <div className="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded-full bg-gray-900/80 border border-gray-700 backdrop-blur-sm">
                <span className="text-xs text-gray-400">
                    {Math.round(scale * 100)}%
                </span>
            </div>

            {/* SVG Container */}
            <div
                ref={containerRef}
                className="h-full w-full cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <div
                    className="mermaid-container h-full w-full flex items-center justify-center"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transformOrigin: "center center",
                        transition: isDragging ? "none" : "transform 0.1s ease-out",
                    }}
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                />
            </div>
        </div>
    );
}
