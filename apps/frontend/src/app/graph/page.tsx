"use client";

/**
 * Dependency Graph Page
 *
 * Migrated to route human graph interactions through shared WarRoomActions (WMCP-2C-R1).
 * Enforces dual Human-Agent parity (WMCP-INV-003, WMCP-INV-004).
 */

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import * as THREE from "three";
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
} from "lucide-react";
import { getEcosystemColor, formatEcosystemName } from "@/lib/utils";
import { GraphControls } from "@/components/graph/graph-controls";
import { NodeTooltip } from "@/components/graph/node-tooltip";
import { LiveUpdateIndicator } from "@/components/graph/live-update-indicator";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { QueryError } from "@/components/ui/error-display";
import { useDependencyGraphUpdates, useConnectionStatus } from "@/lib/hooks";
import { useTheme } from "@/components/providers/theme-provider";
import {
  useWarRoomActions,
  useWarRoomSelector,
  useHumanWarRoomInvocation,
  useWarRoomGraphProjection,
  useWarRoomProjectionLifecycle,
} from "@/components/providers/war-room-provider";
import {
  WarRoomState,
  WarRoomProjectionNode,
  WarRoomProjectionLink,
} from "@/lib/war-room";
import type { PackageEvidence } from "@/lib/war-room";
import type { DependencyGraphUpdate } from "@/lib/graphql/types";
import { WarRoomStatusPanel } from "@/components/war-room/war-room-status-panel";
import SpriteText from "three-spritetext";
import type { NodeObject, LinkObject } from "react-force-graph-3d";

// Dynamic import for 3D Graph
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 text-primary-400 animate-spin" />
        <p className="theme-text-muted animate-pulse">Initializing 3D Engine...</p>
      </div>
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
  const { theme } = useTheme();

  // War Room Actions, Projection Lifecycle & Canonical State
  const actions = useWarRoomActions();
  const createHumanInvocation = useHumanWarRoomInvocation();
  const projectionLifecycle = useWarRoomProjectionLifecycle();

  const canonicalPhase = useWarRoomSelector((s: WarRoomState) => s.phase);
  const canonicalRevision = useWarRoomSelector((s: WarRoomState) => s.contextRevision);
  const canonicalGraph = useWarRoomSelector((s: WarRoomState) =>
    s.phase !== "BOOTSTRAP" && s.phase !== "IDLE" ? s.graph : null
  );
  const canonicalSelection = useWarRoomSelector((s: WarRoomState) =>
    s.phase === "NODE_SELECTED" ||
    s.phase === "SIMULATION_READY" ||
    s.phase === "HUMAN_REVIEW" ||
    s.phase === "PLAN_READY"
      ? s.selection
      : null
  );

  const graphProjection = useWarRoomGraphProjection();

  // Active root package derived from canonical state
  const activePackageId = canonicalGraph?.rootPackage.id || "";
  const selectedPackageId = canonicalSelection?.package.id || null;
  const canonicalState = useWarRoomSelector((s: WarRoomState) => s);
  const [packageEvidence, setPackageEvidence] = useState<PackageEvidence | undefined>();

  useEffect(() => {
    if (!canonicalSelection) {
      setPackageEvidence(undefined);
      return;
    }
    let active = true;
    actions.inspectPackage(createHumanInvocation(), { packageId: canonicalSelection.package.id }).then((result) => {
      if (active && result.ok) setPackageEvidence(result.data.evidence);
    });
    return () => { active = false; };
  }, [actions, canonicalSelection, createHumanInvocation]);

  // UI-Local state
  const [inputValue, setInputValue] = useState(initialPkg);
  const [maxDepth, setMaxDepth] = useState(2);
  const [debouncedMaxDepth, setDebouncedMaxDepth] = useState(maxDepth);
  const [isLoading, setIsLoading] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const showLiveUpdates = true;

  // Active abort controller for in-flight human graph requests
  const activeControllerRef = useRef<AbortController | null>(null);
  const initialLoadedRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Safe SSR check for dark theme
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      if (theme === "system") {
        setIsDark(mediaQuery.matches);
      } else {
        setIsDark(theme === "dark");
      }
    };
    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, [theme]);

  // Debounced depth for graph loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMaxDepth(maxDepth);
    }, 400);
    return () => clearTimeout(timer);
  }, [maxDepth]);

  // Connection status for real-time updates
  const connectionStatus = useConnectionStatus();
  const isConnected = connectionStatus === "connected";

  // Subscribe to live dependency graph updates
  const { updates: liveUpdates } = useDependencyGraphUpdates({
    rootPackageId: activePackageId,
    maxDepth: debouncedMaxDepth,
    paused: !activePackageId || !showLiveUpdates,
    onUpdate: useCallback((update: DependencyGraphUpdate) => {
      if (update.type === "ADD" || update.type === "REMOVE" || update.type === "UPDATE") {
        console.log("[Graph] Live update received:", update);
      }
    }, []),
  });

  // Derive 3D GraphData from non-canonical WarRoomGraphProjection
  const graphData: GraphData = useMemo(() => {
    if (!graphProjection) return { nodes: [], links: [] };

    const nodes: GraphNode[] = graphProjection.nodes.map((node: WarRoomProjectionNode) => ({
      id: node.id,
      name: node.name,
      ecosystem: node.ecosystem,
      color: getEcosystemColor(node.ecosystem),
      depth: node.depth,
      // Keep the root visually dominant without letting the 3D spheres
      // overwhelm the viewport or collide with their labels.
      val: node.isRoot ? 12 : Math.max(5, 9 - node.depth),
    }));

    const links: GraphLink[] = graphProjection.links.map((link: WarRoomProjectionLink) => ({
      source: link.source,
      target: link.target,
    }));

    return { nodes, links };
  }, [graphProjection]);

  // Selected renderer node derived from canonical selection and projection
  const selectedNode = useMemo(() => {
    if (!selectedPackageId) return null;
    return graphData.nodes.find((n) => n.id === selectedPackageId) || null;
  }, [graphData.nodes, selectedPackageId]);

  // Compute graph statistics
  const graphStats = useMemo(() => {
    if (graphData.nodes.length === 0) return null;

    const depths = graphData.nodes.map((n) => n.depth);
    const ecosystems = new Set(graphData.nodes.map((n) => n.ecosystem));
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
      loadedCount: graphProjection?.loadedCount ?? 0,
      totalCount: graphProjection?.totalCount ?? 0,
      truncated: graphProjection?.truncated ?? false,
    };
  }, [graphData, graphProjection]);

  // Centralized human action to open/reload graph
  const handleOpenGraph = useCallback(
    async (rootPackageId: string, depth: number) => {
      if (!rootPackageId.trim()) return;

      // Abort any previous pending human graph request
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }

      const controller = new AbortController();
      activeControllerRef.current = controller;

      setIsLoading(true);
      setUiError(null);

      try {
        const invocation = createHumanInvocation(controller.signal);
        const result = await actions.openPackageGraph(invocation, {
          rootPackageId: rootPackageId.trim(),
          depth,
        });

        if (result.ok) {
          // Activate the staged projection matching this signal and graph ID
          projectionLifecycle.activate(controller.signal, result.data.id);
        } else {
          // Discard staged candidate on any failure or stale context
          projectionLifecycle.discard(controller.signal);
          if (result.error.code !== "CANCELLED" && result.error.code !== "STALE_CONTEXT") {
            setUiError(result.error.message || "Failed to load dependency graph");
          }
        }
      } catch {
        projectionLifecycle.discard(controller.signal);
        setUiError("Unexpected error loading graph");
      } finally {
        if (activeControllerRef.current === controller) {
          setIsLoading(false);
          activeControllerRef.current = null;
        }
      }
    },
    [actions, createHumanInvocation, projectionLifecycle]
  );

  // Initial ?pkg= load when WarRoom store reaches IDLE
  useEffect(() => {
    if (
      !initialLoadedRef.current &&
      initialPkg.trim() &&
      canonicalPhase === "IDLE"
    ) {
      initialLoadedRef.current = true;
      handleOpenGraph(initialPkg, debouncedMaxDepth);
    }
  }, [initialPkg, canonicalPhase, debouncedMaxDepth, handleOpenGraph]);

  // Depth reload action flow
  useEffect(() => {
    if (
      activePackageId &&
      graphProjection &&
      graphProjection.depth !== debouncedMaxDepth
    ) {
      handleOpenGraph(activePackageId, debouncedMaxDepth);
    }
  }, [activePackageId, debouncedMaxDepth, graphProjection, handleOpenGraph]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handleOpenGraph(inputValue.trim(), debouncedMaxDepth);
    }
  };

  const handleRefresh = () => {
    if (activePackageId) {
      handleOpenGraph(activePackageId, debouncedMaxDepth);
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNodeHover = useCallback((node: NodeObject | null) => {
    setHoveredNode(node as GraphNode | null);
  }, []);

  const handleZoomIn = () => {
    if (!graphRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentPos = (graphRef.current as any).cameraPosition();
    const newZ = currentPos.z * 0.7;
    graphRef.current.cameraPosition({ z: newZ }, undefined, 400);
  };

  const handleZoomOut = () => {
    if (!graphRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentPos = (graphRef.current as any).cameraPosition();
    const newZ = currentPos.z / 0.7;
    graphRef.current.cameraPosition({ z: newZ }, undefined, 400);
  };

  const handleCenter = () => {
    if (!graphRef.current) return;
    graphRef.current.zoomToFit(400);
  };

  // Node Click: invokes WarRoomActions.selectPackage
  const handleNodeClick = useCallback(
    async (node: NodeObject) => {
      const graphNode = node as GraphNode;
      const rootPkg = canonicalGraph?.rootPackage;
      const currentEcosystem = (rootPkg && rootPkg.id === graphNode.id)
        ? rootPkg.ecosystem
        : (graphProjection?.nodes.find((n) => n.id === graphNode.id)?.ecosystem || rootPkg?.ecosystem || "NPM");

      const invocation = createHumanInvocation();

      const result = await actions.selectPackage(invocation, {
        selection: {
          package: {
            id: graphNode.id,
            name: graphNode.name,
            ecosystem: currentEcosystem,
          },
        },
      });

      if (result.ok && graphRef.current) {
        const distance = 150;
        const distRatio = 1 + distance / Math.hypot(graphNode.x || 0, graphNode.y || 0, graphNode.z || 0);

        graphRef.current.cameraPosition(
          {
            x: (graphNode.x || 0) * distRatio,
            y: (graphNode.y || 0) * distRatio,
            z: (graphNode.z || 0) * distRatio,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          node as any,
          2000
        );
      }
    },
    [actions, canonicalGraph, graphProjection, createHumanInvocation]
  );

  // Deselect from panel: invokes WarRoomActions.deselectPackage
  const handleDeselect = useCallback(async () => {
    const invocation = createHumanInvocation();
    await actions.deselectPackage(invocation);
  }, [actions, createHumanInvocation]);

  // Redraw Graph from selected node: invokes WarRoomActions.openPackageGraph
  const handleRedrawFromSelected = useCallback(
    (nodeId: string) => {
      setInputValue(nodeId);
      handleOpenGraph(nodeId, debouncedMaxDepth);
    },
    [debouncedMaxDepth, handleOpenGraph]
  );

  // Camera auto-orbit effect
  useEffect(() => {
    if (!graphRef.current) return;
    if (!autoRotate) return;

    let angle = 0;
    const distance = 400;
    const interval = setInterval(() => {
      if (graphRef.current && !hoveredNode && !selectedNode && autoRotate) {
        angle += 0.002;
        graphRef.current.cameraPosition({
          x: distance * Math.sin(angle),
          z: distance * Math.cos(angle),
        });
      }
    }, 20);

    return () => clearInterval(interval);
  }, [hoveredNode, selectedNode, autoRotate]);

  // Initial camera transition
  useEffect(() => {
    if (graphData.nodes.length > 0 && graphRef.current) {
      // The 3D engine can finish measuring its container one frame after the
      // data arrives. Fit twice so the first render never clips the graph.
      graphRef.current.zoomToFit(700, 80);
      const fitTimer = window.setTimeout(() => {
        graphRef.current?.zoomToFit(500, 80);
      }, 250);
      return () => window.clearTimeout(fitTimer);
    }
  }, [graphData.nodes.length]);

  const handleGraphEngineStop = useCallback(() => {
    // Fit after the force simulation has positioned the nodes. The data-length
    // effect can run before the dynamically loaded 3D ref exists.
    graphRef.current?.zoomToFit(800, 120);
  }, []);

  // Export functions
  const exportAsJSON = useCallback(() => {
    const data = {
      root: activePackageId,
      timestamp: new Date().toISOString(),
      nodes: graphData.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        ecosystem: n.ecosystem,
        depth: n.depth,
      })),
      edges: graphData.links.map((l) => ({
        source: typeof l.source === "object" ? l.source.id : l.source,
        target: typeof l.target === "object" ? l.target.id : l.target,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activePackageId.replace(/:/g, "-")}-dependencies.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [graphData, activePackageId]);

  const exportAsPNG = useCallback(() => {
    if (!graphRef.current) return;

    const canvas = document.querySelector(".force-graph-container canvas") as HTMLCanvasElement;
    if (canvas) {
      const link = document.createElement("a");
      link.download = `${activePackageId.replace(/:/g, "-")}-graph.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }
    setShowExportMenu(false);
  }, [activePackageId]);

  const copyShareLink = useCallback(async () => {
    const url = `${window.location.origin}/graph?pkg=${encodeURIComponent(activePackageId)}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activePackageId]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div
      className="h-auto flex flex-col gap-4 pb-4"
      data-war-room-phase={canonicalPhase}
      data-war-room-revision={canonicalRevision}
      data-war-room-root-package={activePackageId || undefined}
      data-war-room-selected-package={selectedPackageId || undefined}
      data-war-room-projection-graph={graphProjection?.graphId || undefined}
      data-war-room-projection-root={graphProjection?.rootPackageId || undefined}
    >
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
            Explore reverse dependencies in 3D
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            data-testid="graph-package-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter package ID (e.g., cargo:tokio)"
            className="input-search max-w-xs !pl-4 focus:ring-primary-500/50 shadow-lg"
          />
          <button
            type="submit"
            data-testid="render-graph-button"
            className="btn-primary whitespace-nowrap"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
            Render Graph
          </button>
        </form>
      </motion.div>

      <WarRoomStatusPanel state={canonicalState} evidence={packageEvidence} versionExposure={actions.getLatestVersionExposure()?.result} />

      {/* Main Graph Area */}
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onMouseMove={handleMouseMove}
        className={`h-[clamp(420px,calc(100vh-28rem),680px)] flex-none relative graph-container ${isFullscreen ? "theme-graph-bg" : ""}`}
      >
        {/* 3D Graph Canvas */}
        {graphData.nodes.length > 0 ? (
          <ForceGraph3D
            ref={graphRef}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            showNavInfo={false}
            nodeLabel={() => ""}
            nodeColor={(node) => (node as GraphNode).color}
            nodeVal={(node) => (node as GraphNode).val}
            nodeResolution={32}
            nodeThreeObject={(node) => {
              const graphNode = node as GraphNode;
              const isSelected = selectedNode?.id === graphNode.id;
              const isHovered = hoveredNode?.id === graphNode.id;

              const group = new THREE.Group();

              const sphereSize = graphNode.val;
              const sphereGeometry = new THREE.SphereGeometry(sphereSize, 32, 32);
              const sphereMaterial = new THREE.MeshPhongMaterial({
                color: new THREE.Color(graphNode.color),
                emissive: new THREE.Color(graphNode.color),
                emissiveIntensity: isSelected ? 0.8 : isHovered ? 0.5 : 0.2,
                transparent: true,
                opacity: 0.9,
              });
              const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
              group.add(sphere);

              if (isSelected || isHovered) {
                const ringGeometry = new THREE.RingGeometry(sphereSize * 1.2, sphereSize * 1.4, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                  color: new THREE.Color(graphNode.color),
                  side: THREE.DoubleSide,
                  transparent: true,
                  opacity: 0.8,
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.rotation.x = Math.PI / 2;
                group.add(ring);
              }

              const sprite = new SpriteText(graphNode.name);
              sprite.color = isDark ? "#ffffff" : "#0f172a";
              sprite.textHeight = Math.max(6, 12 - graphNode.depth * 2);
              sprite.position.y = sphereSize + 8;
              sprite.backgroundColor = isDark ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.85)";
              sprite.padding = [3, 1.5];
              sprite.borderRadius = 3;
              group.add(sprite);

              return group;
            }}
            nodeThreeObjectExtend={false}
            linkColor={() => (isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)")}
            linkWidth={1.5}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalParticleColor={() => (isDark ? "#818cf8" : "#4f46e5")}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            enableNodeDrag={false}
            enableNavigationControls={true}
            warmupTicks={100}
            cooldownTicks={100}
            onEngineStop={handleGraphEngineStop}
          />
        ) : !isLoading && !uiError ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <GitBranch className="w-16 h-16 theme-text-muted mx-auto mb-4 opacity-50" />
              <p className="theme-text-muted text-lg">Enter a package ID to explore its dependency graph</p>
              <p className="text-sm theme-text-faint mt-1">Try &quot;cargo:tokio&quot; or &quot;npm:react&quot;</p>
            </div>
          </div>
        ) : null}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-30">
            <div className="flex flex-col items-center gap-3 glass-card p-6 rounded-2xl shadow-xl">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
              <p className="text-sm font-medium theme-text-primary">Loading graph through War Room actions...</p>
            </div>
          </div>
        )}

        {/* UI Error Display */}
        {uiError && (
          <div className="absolute inset-0 flex items-center justify-center p-6 z-30 pointer-events-none">
            <div className="pointer-events-auto max-w-md">
              <QueryError error={new Error(uiError)} onRetry={handleRefresh} />
            </div>
          </div>
        )}

        {/* Tooltip on Hover */}
        {hoveredNode && !selectedNode && (
          <NodeTooltip
            node={hoveredNode}
            position={tooltipPos}
          />
        )}

        {/* Live Update Indicator */}
        {activePackageId && showLiveUpdates && (
          <div className="absolute top-4 right-4 z-20">
            <LiveUpdateIndicator
              updates={liveUpdates}
              isConnected={isConnected}
            />
          </div>
        )}

        {/* Graph Controls */}
        {graphData.nodes.length > 0 && (
          <GraphControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCenter={handleCenter}
            onRefresh={handleRefresh}
            autoRotate={autoRotate}
            onAutoRotateToggle={() => setAutoRotate(!autoRotate)}
            maxDepth={maxDepth}
            onMaxDepthChange={setMaxDepth}
            loading={isLoading}
            isPaused={isPaused}
            onPlayPauseToggle={() => setIsPaused(!isPaused)}
          />
        )}

        {/* Graph Legend */}
        {graphStats && (
          <div className="absolute bottom-4 right-4 z-20 hidden sm:block glass-card px-4 py-3 shadow-2xl border-white/10 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-5 mb-2">
              <span className="text-[10px] theme-text-faint uppercase font-bold tracking-wider">Graph key</span>
              <span className="text-[10px] theme-text-faint">Click a node to inspect</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {graphStats.ecosystems.map((eco) => (
                <div key={eco} className="flex items-center gap-2 text-xs theme-text-secondary">
                  <span
                    className="h-2.5 w-2.5 rounded-full shadow-[0_0_10px_currentColor]"
                    style={{ backgroundColor: getEcosystemColor(eco), color: getEcosystemColor(eco) }}
                  />
                  {formatEcosystemName(eco)}
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs theme-text-secondary">
                <span className="h-px w-5 bg-primary-400/70" />
                Dependency edge
              </div>
            </div>
          </div>
        )}

        {/* Graph Statistics Card */}
        {graphStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-4 left-4 glass-card p-4 rounded-xl text-xs space-y-2 z-20 max-w-xs"
          >
            <div className="font-semibold theme-text-primary flex items-center justify-between">
              <span>Graph Statistics</span>
              {graphStats.truncated && (
                <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                  Showing {graphStats.loadedCount} of {graphStats.totalCount} reverse dependents
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center pt-1">
              <div>
                <span className="theme-text-muted">Nodes </span>
                <span className="theme-text-primary font-semibold">
                  <AnimatedCounter value={graphStats.nodeCount} duration={0.5} />
                </span>
              </div>
              <div>
                <span className="theme-text-muted">Links </span>
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
              {graphStats.ecosystems.map((eco) => (
                <button
                  key={eco}
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
          <button
            onClick={toggleFullscreen}
            className="glass-card p-2 theme-inner-card-hover transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen mode"}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5 theme-text-muted" /> : <Maximize2 className="w-5 h-5 theme-text-muted" />}
          </button>

          {activePackageId && (
            <button
              onClick={copyShareLink}
              className="glass-card p-2 theme-inner-card-hover transition-colors"
              title="Copy share link"
            >
              {copied ? <Check className="w-5 h-5 text-success" /> : <Share2 className="w-5 h-5 theme-text-muted" />}
            </button>
          )}

          <button
            onClick={() => setShowChat(!showChat)}
            className={`glass-card p-2 theme-inner-card-hover transition-colors ${showChat ? "text-purple-400 border-purple-500/50 bg-purple-500/10" : "theme-text-muted"}`}
            title="Ask Gemini AI"
          >
            <Sparkles className="w-5 h-5" />
          </button>

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
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm theme-text-tertiary theme-hover-text theme-inner-card-hover transition-colors"
                  >
                    <FileJson className="w-4 h-4" />
                    Export as JSON
                  </button>
                  <button
                    onClick={exportAsPNG}
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm theme-text-tertiary theme-hover-text theme-inner-card-hover transition-colors"
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
              data-testid="selected-node-panel"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full animate-pulse"
                      style={{ backgroundColor: selectedNode.color }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-tighter font-bold px-2 py-0.5 rounded bg-black/5 dark:bg-white/5"
                      style={{ color: selectedNode.color }}
                    >
                      {formatEcosystemName(selectedNode.ecosystem)}
                    </span>
                  </div>
                </div>
                <button
                  data-testid="selected-node-close-button"
                  onClick={handleDeselect}
                  className="p-1.5 rounded-lg theme-text-faint hover:theme-text-primary hover:bg-black/5 hover:dark:bg-white/10 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-xl font-bold theme-text-primary font-mono mb-4 leading-tight break-all">
                {selectedNode.name}
              </h3>

              <div className="space-y-3 mb-6">
                <div className="p-3 rounded-xl bg-black/5 dark:bg-black/20 border border-surface-200/50 dark:border-white/5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs theme-text-faint uppercase font-semibold">Package ID</span>
                    <button
                      className="text-[10px] theme-text-accent hover:underline"
                      onClick={() => navigator.clipboard.writeText(selectedNode.id)}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="theme-text-secondary font-mono text-xs break-all">
                    {selectedNode.id}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-surface-200/50 dark:border-white/5">
                    <span className="block text-[10px] theme-text-faint uppercase font-semibold mb-1">Depth</span>
                    <span className="text-lg font-bold theme-text-primary">{selectedNode.depth}</span>
                  </div>
                  {/* Truthful analysis field replacing unsupported Impact High claim */}
                  <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-surface-200/50 dark:border-white/5">
                    <span className="block text-[10px] theme-text-faint uppercase font-semibold mb-1">Analysis</span>
                    <span className="text-sm font-semibold theme-text-muted">Not analyzed</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  data-testid="redraw-graph-button"
                  onClick={() => handleRedrawFromSelected(selectedNode.id)}
                  className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-lg shadow-primary-500/20"
                >
                  <GitBranch className="w-4 h-4" />
                  Redraw Graph
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`/explore?q=${encodeURIComponent(selectedNode.id)}`}
                    className="glass-card py-2.5 rounded-xl text-sm text-center theme-text-tertiary theme-hover-text theme-inner-card-hover transition-all flex items-center justify-center gap-2 border border-surface-200 dark:border-white/5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Details
                  </a>
                  <a
                    href={`/impact?pkg=${encodeURIComponent(selectedNode.id)}`}
                    className="glass-card py-2.5 rounded-xl text-sm text-center theme-text-tertiary hover:text-danger hover:border-danger/30 transition-all flex items-center justify-center gap-2 border border-surface-200 dark:border-white/5"
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
    <Suspense
      fallback={
        <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      }
    >
      <GraphPageContent />
    </Suspense>
  );
}
