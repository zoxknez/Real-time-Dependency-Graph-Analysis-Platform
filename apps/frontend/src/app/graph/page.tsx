"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useLazyQuery } from "@apollo/client";
import {
  GitBranch,
  Maximize2,
  Minimize2,
  Download,
  Loader2,
  Info,
  Share2,
  FileJson,
  Image,
  X,
  ExternalLink,
  Check,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { GET_REVERSE_DEPENDENTS } from "@/lib/graphql/queries";
import { getEcosystemColor, parsePackageId, formatEcosystemName } from "@/lib/utils";
import { GraphControls } from "@/components/graph/graph-controls";
import { NodeTooltip } from "@/components/graph/node-tooltip";
import { GraphMinimap } from "@/components/graph/graph-minimap";
import { LiveUpdateIndicator } from "@/components/graph/live-update-indicator";
import { GeminiChat } from "@/components/GeminiChat";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { QueryError, EmptyState } from "@/components/ui/error-display";
import { useDependencyGraphUpdates, useConnectionStatus } from "@/lib/hooks";
import type { DependencyGraphUpdate, PackageEdge } from "@/lib/graphql/types";
import type { NodeObject, LinkObject, ForceGraph2DMethods } from "react-force-graph-2d";

// Dynamic import for SSR compatibility
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
    </div>
  ),
});

type GraphNode = NodeObject & {
  id: string;
  name: string;
  ecosystem: string;
  color: string;
  depth: number;
  val: number;
};

type GraphLink = LinkObject & {
  source: string | { id: string };
  target: string | { id: string };
};

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

function GraphPageContent() {
  const searchParams = useSearchParams();
  const initialPkg = searchParams.get("pkg") || "";

  type ForceGraphApiCompat = {
    zoom(): number;
    zoom(zoom: number, ms?: number): void;
    centerAt(): { x: number; y: number };
    centerAt(x: number, y: number, ms?: number): void;
    zoomToFit(ms?: number, padding?: number): void;
  };

  const graphRef = useRef<ForceGraph2DMethods | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [packageId, setPackageId] = useState(initialPkg);
  const [inputValue, setInputValue] = useState(initialPkg);
  const [maxDepth, setMaxDepth] = useState(2);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const showLiveUpdates = true;
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const [getReverseDeps, { data: reverseDepsData, loading, error }] = useLazyQuery(GET_REVERSE_DEPENDENTS);

  // Debounced depth for graph loading
  const [debouncedMaxDepth, setDebouncedMaxDepth] = useState(maxDepth);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMaxDepth(maxDepth);
    }, 400);
    return () => clearTimeout(timer);
  }, [maxDepth]);

  // Connection status for real-time updates
  const connectionStatus = useConnectionStatus();

  // Subscribe to live dependency graph updates
  const { updates: liveUpdates } = useDependencyGraphUpdates({
    rootPackageId: packageId,
    maxDepth: debouncedMaxDepth,
    paused: !packageId || !showLiveUpdates,
    onUpdate: useCallback((update: DependencyGraphUpdate) => {
      // When we receive an update, refresh the graph
      // Could also do incremental updates here for better performance
      if (update.type === "ADD" || update.type === "REMOVE" || update.type === "UPDATE") {
        // For now, just reload the whole graph
        // In production, we'd apply incremental updates
        console.log("[Graph] Live update received:", update);
      }
    }, []),
  });

  // Compute graph statistics
  const graphStats = useMemo(() => {
    if (graphData.nodes.length === 0) return null;

    const depths = graphData.nodes.map(n => n.depth);
    const ecosystems = new Set(graphData.nodes.map(n => n.ecosystem));
    const maxDepthFound = Math.max(...depths);
    const depthCounts = depths.reduce((acc, d) => {
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return {
      nodeCount: graphData.nodes.length,
      edgeCount: graphData.links.length,
      maxDepth: maxDepthFound,
      ecosystemCount: ecosystems.size,
      ecosystems: Array.from(ecosystems),
      depthCounts,
    };
  }, [graphData]);

  const buildGraphData = useCallback((rootId: string, edges: PackageEdge[]) => {
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    // Add root node
    const { name, ecosystem } = parsePackageId(rootId);
    nodesMap.set(rootId, {
      id: rootId,
      name,
      ecosystem: ecosystem.toUpperCase(),
      color: getEcosystemColor(ecosystem),
      depth: 0,
      val: 30, // Larger for root
    });

    // Add dependent nodes
    edges.forEach((edge) => {
      const node = edge.node;
      const depth = edge.depth || 1;

      if (!nodesMap.has(node.id)) {
        nodesMap.set(node.id, {
          id: node.id,
          name: node.name,
          ecosystem: node.ecosystem,
          color: getEcosystemColor(node.ecosystem),
          depth,
          val: Math.max(10, 25 - depth * 5), // Smaller as depth increases
        });
      }

      // Dependents point TO the root (reverse dependency)
      links.push({
        source: node.id,
        target: rootId,
      });
    });

    setGraphData({
      nodes: Array.from(nodesMap.values()),
      links,
    });
  }, []);

  // Build graph when data changes
  useEffect(() => {
    if (reverseDepsData?.reverseDependents && packageId) {
      buildGraphData(packageId, reverseDepsData.reverseDependents.edges);
    }
  }, [reverseDepsData, packageId, buildGraphData]);

  const loadGraph = useCallback(() => {
    if (packageId.trim()) {
      getReverseDeps({
        variables: {
          packageId: packageId.trim(),
          maxDepth: debouncedMaxDepth,
          first: 100,
        },
      });
    }
  }, [packageId, debouncedMaxDepth, getReverseDeps]);

  useEffect(() => {
    if (initialPkg) {
      setPackageId(initialPkg);
      setInputValue(initialPkg);
    }
  }, [initialPkg]);

  useEffect(() => {
    if (packageId) {
      loadGraph();
    }
  }, [packageId, loadGraph]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPackageId(inputValue.trim());
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNodeHover = useCallback((node: NodeObject | null) => {
    setHoveredNode(node as GraphNode | null);
  }, []);

  const handleZoomIn = () => {
    if (!graphRef.current) return;
    const fg = graphRef.current as unknown as ForceGraphApiCompat;
    const currentZoom = fg.zoom();
    fg.zoom(currentZoom * 1.3, 300);
  };
  const handleZoomOut = () => {
    if (!graphRef.current) return;
    const fg = graphRef.current as unknown as ForceGraphApiCompat;
    const currentZoom = fg.zoom();
    fg.zoom(currentZoom / 1.3, 300);
  };
  const handleCenter = () => {
    if (!graphRef.current) return;
    const fg = graphRef.current as unknown as ForceGraphApiCompat;
    fg.zoomToFit(400);
  };
  const handleRefresh = () => loadGraph();

  // Navigate to position from minimap
  const navigateToPosition = useCallback((x: number, y: number) => {
    if (graphRef.current) {
      graphRef.current.centerAt(x, y, 300);
    }
  }, []);

  // Update viewport state when graph moves (for minimap)
  const updateViewBox = useCallback(() => {
    if (!graphRef.current || !containerRef.current) return;

    const { width, height } = containerRef.current.getBoundingClientRect();
    const fg = graphRef.current as unknown as ForceGraphApiCompat;
    const zoom = fg.zoom();
    const center = fg.centerAt();

    if (center) {
      setViewBox({
        x: center.x - (width / 2 / zoom),
        y: center.y - (height / 2 / zoom),
        width: width / zoom,
        height: height / zoom,
      });
    }
  }, []);

  useEffect(() => {
    if (graphData.nodes.length > 0) {
      updateViewBox();
    }
  }, [graphData.nodes.length, updateViewBox]);

  // Export functions
  const exportAsJSON = useCallback(() => {
    const data = {
      root: packageId,
      timestamp: new Date().toISOString(),
      nodes: graphData.nodes.map(n => ({
        id: n.id,
        name: n.name,
        ecosystem: n.ecosystem,
        depth: n.depth,
      })),
      edges: graphData.links.map(l => ({
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${packageId.replace(/:/g, '-')}-dependencies.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [graphData, packageId]);

  const exportAsPNG = useCallback(() => {
    if (!graphRef.current) return;

    const canvas = document.querySelector('.force-graph-container canvas') as HTMLCanvasElement;
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${packageId.replace(/:/g, '-')}-graph.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    setShowExportMenu(false);
  }, [packageId]);

  const copyShareLink = useCallback(async () => {
    const url = `${window.location.origin}/graph?pkg=${encodeURIComponent(packageId)}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [packageId]);

  const handleNodeClick = useCallback((node: NodeObject) => {
    setSelectedNode(node as GraphNode);
  }, []);

  const navigateToNode = useCallback((nodeId: string) => {
    setPackageId(nodeId);
    setInputValue(nodeId);
    setSelectedNode(null);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold theme-text-primary flex items-center gap-3">
            <GitBranch className="w-8 h-8 text-accent-400" />
            Dependency Graph
          </h1>
          <p className="theme-text-muted mt-1">
            Visualize package dependencies interactively
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter package ID..."
            className="input-search max-w-xs"
          />
          <button type="submit" className="btn-primary whitespace-nowrap">
            Load Graph
          </button>
        </form>
      </motion.div>

      {/* Main Graph Area */}
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onMouseMove={handleMouseMove}
        className={`flex-1 relative graph-container ${isFullscreen ? 'theme-graph-bg' : ''}`}
      >
        {/* Graph Canvas */}
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeLabel={() => ""}
            nodeColor={(node) => (node as GraphNode).color}
            nodeVal={(node) => (node as GraphNode).val}
            nodeRelSize={4}
            linkColor={() => "rgba(100, 116, 139, 0.3)"}
            linkWidth={1.5}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            backgroundColor="transparent"
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onZoomEnd={updateViewBox}
            nodeCanvasObject={(node, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const graphNode = node as GraphNode;
              const label = graphNode.name;
              const fontSize = Math.min(14 / globalScale, 12);
              ctx.font = `${fontSize}px Inter, sans-serif`;

              // Node circle
              ctx.beginPath();
              ctx.arc(graphNode.x ?? 0, graphNode.y ?? 0, graphNode.val / 2, 0, 2 * Math.PI);
              ctx.fillStyle = graphNode.color;
              ctx.fill();

              // Glow effect for root and selected
              if (graphNode.depth === 0 || selectedNode?.id === graphNode.id) {
                ctx.shadowColor = graphNode.color;
                ctx.shadowBlur = 15;
                if (graphNode.depth === 0) {
                  // Pulse root node
                  const pulse = (Math.sin(Date.now() / 400) + 1) / 2;
                  ctx.shadowBlur = 10 + pulse * 20;
                }
                ctx.fill();
                ctx.shadowBlur = 0;
              }

              // Label
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#fff";
              if (globalScale > 0.8) {
                ctx.fillText(label, graphNode.x ?? 0, (graphNode.y ?? 0) + graphNode.val / 2 + fontSize + 2);
              }
            }}
            cooldownTicks={100}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center theme-text-muted">
            {loading ? (
              <>
                <Loader2 className="w-12 h-12 animate-spin mb-4" />
                <p>Loading graph data...</p>
              </>
            ) : error ? (
              <QueryError
                error={error}
                onRetry={() => packageId && getReverseDeps({
                  variables: { packageId, maxDepth, first: 500 }
                })}
              />
            ) : (
              <EmptyState
                icon={GitBranch}
                title="Enter a package to visualize"
                description="Enter a package ID like cargo:tokio or pypi:requests to see its dependency graph"
              />
            )}
          </div>
        )}

        {/* Controls Overlay */}
        <GraphControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onCenter={handleCenter}
          onRefresh={handleRefresh}
          maxDepth={maxDepth}
          onMaxDepthChange={setMaxDepth}
          loading={loading}
        />

        {/* Minimap */}
        {graphData.nodes.length > 0 && (
          <GraphMinimap
            nodes={graphData.nodes.map(n => ({
              id: n.id,
              x: n.x ?? 0,
              y: n.y ?? 0,
              color: n.color,
              depth: n.depth,
            }))}
            viewBox={viewBox}
            onNavigate={navigateToPosition}
            className="absolute top-4 right-4"
          />
        )}

        {/* Live Updates Indicator */}
        {packageId && showLiveUpdates && (
          <LiveUpdateIndicator
            updates={liveUpdates}
            isConnected={connectionStatus === "connected"}
            className="absolute top-4 right-[220px]"
          />
        )}

        {/* Tooltip */}
        {hoveredNode && !selectedNode && (
          <NodeTooltip node={hoveredNode} position={tooltipPos} />
        )}

        {/* Stats Overlay - Enhanced with Legend */}
        {graphStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-4 left-4 glass-card p-4 space-y-3"
          >
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="theme-text-muted">Nodes </span>
                <span className="theme-text-primary font-semibold">
                  <AnimatedCounter value={graphStats.nodeCount} duration={0.5} />
                </span>
              </div>
              <div>
                <span className="theme-text-muted">Edges </span>
                <span className="theme-text-primary font-semibold">
                  <AnimatedCounter value={graphStats.edgeCount} duration={0.5} />
                </span>
              </div>
              <div>
                <span className="theme-text-muted">Max Depth </span>
                <span className="theme-text-primary font-semibold">{graphStats.maxDepth}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t theme-border">
              <span className="text-xs theme-text-faint mr-1">Ecosystems:</span>
              {graphStats.ecosystems.map(eco => (
                <button
                  key={eco}
                  onClick={() => {
                    // Could filter by ecosystem in future
                  }}
                  className="px-2 py-0.5 rounded text-xs font-medium hover:ring-1 transition-all cursor-pointer"
                  style={{
                    backgroundColor: `${getEcosystemColor(eco)}20`,
                    color: getEcosystemColor(eco),
                  }}
                  title={`Filter by ${formatEcosystemName(eco)}`}
                >
                  {formatEcosystemName(eco)}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Export Menu */}
        <div className="absolute top-4 right-4 flex gap-2">
          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="glass-card p-2 theme-inner-card-hover transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen mode"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 theme-text-muted" />
            ) : (
              <Maximize2 className="w-5 h-5 theme-text-muted" />
            )}
          </button>

          {/* Share Button */}
          {packageId && (
            <button
              onClick={copyShareLink}
              className="glass-card p-2 theme-inner-card-hover transition-colors"
              title="Copy share link"
            >
              {copied ? (
                <Check className="w-5 h-5 text-success" />
              ) : (
                <Share2 className="w-5 h-5 theme-text-muted" />
              )}
            </button>
          )}

          {/* Gemini Chat Toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className={`glass-card p-2 theme-inner-card-hover transition-colors ${showChat ? "text-purple-400 border-purple-500/50 bg-purple-500/10" : "theme-text-muted"}`}
            title="Ask Gemini AI"
          >
            <Sparkles className="w-5 h-5" />
          </button>

          {/* Export Button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="glass-card p-2 theme-inner-card-hover transition-colors"
              title="Export graph"
            >
              <Download className="w-5 h-5 theme-text-muted" />
            </button>

            <AnimatePresence>
              {showExportMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute top-full right-0 mt-2 glass-card py-2 min-w-[160px] z-50"
                >
                  <button
                    onClick={exportAsJSON}
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm theme-text-tertiary 
                             theme-hover-text theme-inner-card-hover transition-colors"
                  >
                    <FileJson className="w-4 h-4" />
                    Export as JSON
                  </button>
                  <button
                    onClick={exportAsPNG}
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm theme-text-tertiary 
                             theme-hover-text theme-inner-card-hover transition-colors"
                  >
                    <Image className="w-4 h-4" />
                    Export as PNG
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Selected Node Panel - Premium Slide-over */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute top-4 right-4 glass-card p-6 w-80 z-40 shadow-2xl border-primary-500/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full animate-pulse"
                      style={{ backgroundColor: selectedNode.color }}
                    />
                    <span className="text-[10px] uppercase tracking-tighter font-bold px-2 py-0.5 rounded bg-white/5"
                      style={{ color: selectedNode.color }}
                    >
                      {formatEcosystemName(selectedNode.ecosystem)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1.5 rounded-lg theme-text-faint hover:theme-text-primary hover:bg-white/10 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-xl font-bold theme-text-primary font-mono mb-4 leading-tight break-all">
                {selectedNode.name}
              </h3>

              <div className="space-y-3 mb-6">
                <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs theme-text-faint uppercase font-semibold">Package ID</span>
                    <button className="text-[10px] theme-text-accent hover:underline" onClick={() => navigator.clipboard.writeText(selectedNode.id)}>Copy</button>
                  </div>
                  <p className="theme-text-secondary font-mono text-xs break-all">
                    {selectedNode.id}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="block text-[10px] theme-text-faint uppercase font-semibold mb-1">Depth</span>
                    <span className="text-lg font-bold theme-text-primary">{selectedNode.depth}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="block text-[10px] theme-text-faint uppercase font-semibold mb-1">Impact</span>
                    <span className="text-lg font-bold theme-text-primary">High</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => navigateToNode(selectedNode.id)}
                  className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-lg shadow-primary-500/20"
                >
                  <GitBranch className="w-4 h-4" />
                  Redraw Graph
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`/explore?q=${encodeURIComponent(selectedNode.id)}`}
                    className="glass-card py-2.5 rounded-xl text-sm text-center theme-text-tertiary 
                             theme-hover-text theme-inner-card-hover transition-all 
                             flex items-center justify-center gap-2 border border-white/5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Details
                  </a>
                  <a
                    href={`/impact?pkg=${encodeURIComponent(selectedNode.id)}`}
                    className="glass-card py-2.5 rounded-xl text-sm text-center theme-text-tertiary 
                             hover:text-danger hover:border-danger/30 transition-all 
                             flex items-center justify-center gap-2 border border-white/5"
                  >
                    <Info className="w-4 h-4" />
                    Impact
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    }>
      <GraphPageContent />
    </Suspense>
  );
}
