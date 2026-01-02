"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useLazyQuery } from "@apollo/client";
import {
  GitBranch,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings2,
  Download,
  Loader2,
  Info,
  Share2,
  FileJson,
  Image,
  X,
  ExternalLink,
  Copy,
  Check,
  Shield,
} from "lucide-react";
import { GET_REVERSE_DEPENDENTS } from "@/lib/graphql/queries";
import { cn, getEcosystemColor, parsePackageId, formatEcosystemName } from "@/lib/utils";
import { GraphControls } from "@/components/graph/graph-controls";
import { GraphLegend } from "@/components/graph/graph-legend";
import { NodeTooltip } from "@/components/graph/node-tooltip";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SkeletonCard } from "@/components/ui/skeleton";

// Dynamic import for SSR compatibility
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
    </div>
  ),
});

interface GraphNode {
  id: string;
  name: string;
  ecosystem: string;
  color: string;
  depth: number;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

function GraphPageContent() {
  const searchParams = useSearchParams();
  const initialPkg = searchParams.get("pkg") || "";

  const graphRef = useRef<any>(null);
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

  const [getReverseDeps, { data: reverseDepsData, loading }] = useLazyQuery(GET_REVERSE_DEPENDENTS);

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

  // Build graph when data changes
  useEffect(() => {
    if (reverseDepsData?.reverseDependents && packageId) {
      buildGraphData(packageId, reverseDepsData.reverseDependents.edges);
    }
  }, [reverseDepsData, packageId]);

  const buildGraphData = useCallback((rootId: string, edges: any[]) => {
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
    edges.forEach((edge: any) => {
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

  const loadGraph = useCallback(() => {
    if (packageId.trim()) {
      getReverseDeps({
        variables: {
          packageId: packageId.trim(),
          maxDepth,
          first: 100,
        },
      });
    }
  }, [packageId, maxDepth, getReverseDeps]);

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

  const handleNodeHover = useCallback((node: GraphNode | null, event?: MouseEvent) => {
    setHoveredNode(node);
    if (node && event) {
      setTooltipPos({ x: event.clientX, y: event.clientY });
    }
  }, []);

  const handleZoomIn = () => graphRef.current?.zoom(graphRef.current.zoom() * 1.3, 300);
  const handleZoomOut = () => graphRef.current?.zoom(graphRef.current.zoom() / 1.3, 300);
  const handleCenter = () => graphRef.current?.zoomToFit(400);
  const handleRefresh = () => loadGraph();

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
        source: typeof l.source === 'object' ? (l.source as any).id : l.source,
        target: typeof l.target === 'object' ? (l.target as any).id : l.target,
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

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
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
        className={`flex-1 relative graph-container ${isFullscreen ? 'theme-graph-bg' : ''}`}
      >
        {/* Graph Canvas */}
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeLabel={() => ""}
            nodeColor={(node: any) => node.color}
            nodeVal={(node: any) => node.val}
            nodeRelSize={4}
            linkColor={() => "rgba(100, 116, 139, 0.3)"}
            linkWidth={1.5}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            backgroundColor="transparent"
            onNodeHover={handleNodeHover as any}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.name;
              const fontSize = Math.min(14 / globalScale, 12);
              ctx.font = `${fontSize}px Inter, sans-serif`;
              
              // Node circle
              ctx.beginPath();
              ctx.arc(node.x, node.y, node.val / 2, 0, 2 * Math.PI);
              ctx.fillStyle = node.color;
              ctx.fill();
              
              // Glow effect for root
              if (node.depth === 0) {
                ctx.shadowColor = node.color;
                ctx.shadowBlur = 15;
                ctx.fill();
                ctx.shadowBlur = 0;
              }
              
              // Label
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#fff";
              if (globalScale > 0.8) {
                ctx.fillText(label, node.x, node.y + node.val / 2 + fontSize + 2);
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
            ) : (
              <>
                <GitBranch className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Enter a package to visualize</p>
                <p className="text-sm mt-2">e.g., cargo:tokio, pypi:requests</p>
              </>
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

        {/* Selected Node Panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-4 left-4 glass-card p-4 w-72 z-40"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: selectedNode.color }}
                  />
                  <span className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{ 
                      backgroundColor: `${selectedNode.color}20`,
                      color: selectedNode.color,
                    }}
                  >
                    {formatEcosystemName(selectedNode.ecosystem)}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="theme-text-muted theme-hover-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <h3 className="text-lg font-semibold theme-text-primary font-mono mb-2">
                {selectedNode.name}
              </h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="theme-text-muted">ID</span>
                  <span className="theme-text-secondary font-mono text-xs truncate max-w-[150px]">
                    {selectedNode.id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="theme-text-muted">Depth</span>
                  <span className="theme-text-secondary">{selectedNode.depth}</span>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t theme-border space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => navigateToNode(selectedNode.id)}
                    className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-2"
                  >
                    <GitBranch className="w-4 h-4" />
                    View Graph
                  </button>
                  <a
                    href={`/explore?q=${encodeURIComponent(selectedNode.id)}`}
                    className="flex-1 glass-card py-2 text-sm text-center theme-text-tertiary 
                             theme-hover-text theme-inner-card-hover transition-colors 
                             flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Explore
                  </a>
                </div>
                <a
                  href={`/impact?pkg=${encodeURIComponent(selectedNode.id)}`}
                  className="w-full glass-card py-2 text-sm text-center theme-text-tertiary 
                           theme-hover-text hover:bg-danger/20 hover:text-danger transition-colors 
                           flex items-center justify-center gap-2"
                >
                  <Info className="w-4 h-4" />
                  Impact Analysis
                </a>
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
