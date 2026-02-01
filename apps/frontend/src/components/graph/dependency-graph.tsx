/**
 * Interactive Dependency Graph Visualization
 * 
 * Force-directed graph using D3.js for visualizing package dependencies.
 * Features: zoom, pan, node selection, filtering, and live updates.
 */

"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GraphNode {
  id: string;
  name: string;
  ecosystem: string;
  depth: number;
  isRoot?: boolean;
  hasVulnerabilities?: boolean;
  vulnerabilityCount?: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: "direct" | "transitive" | "devDependency";
  versionReq?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface DependencyGraphProps {
  data: GraphData;
  width?: number;
  height?: number;
  className?: string;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  selectedNodeId?: string | null;
  highlightPath?: string[];
  showLabels?: boolean;
  showVulnerabilities?: boolean;
  colorByEcosystem?: boolean;
  enableZoom?: boolean;
  enableDrag?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ECOSYSTEM_COLORS: Record<string, string> = {
  NPM: "#cb3837",
  PY_PI: "#3776ab",
  CARGO: "#dea584",
  MAVEN: "#c71a36",
  NU_GET: "#512bd4",
  GO: "#00add8",
  UNKNOWN: "#6b7280",
};

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#ca8a04",
  LOW: "#16a34a",
};

const NODE_RADIUS = {
  root: 20,
  depth1: 14,
  depth2: 10,
  default: 8,
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function DependencyGraph({
  data,
  width = 800,
  height = 600,
  className,
  onNodeClick,
  onNodeHover,
  selectedNodeId,
  highlightPath,
  showLabels = true,
  showVulnerabilities = true,
  colorByEcosystem = true,
  enableZoom = true,
  enableDrag = true,
}: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width, height });

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width || width,
          height: entry.contentRect.height || height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width, height]);

  // Get node radius based on depth
  const getNodeRadius = useCallback((node: GraphNode) => {
    if (node.isRoot) return NODE_RADIUS.root;
    if (node.depth === 1) return NODE_RADIUS.depth1;
    if (node.depth === 2) return NODE_RADIUS.depth2;
    return NODE_RADIUS.default;
  }, []);

  // Get node color
  const getNodeColor = useCallback(
    (node: GraphNode): string => {
      if (showVulnerabilities && node.hasVulnerabilities && node.riskLevel) {
        const riskColor = RISK_COLORS[node.riskLevel];
        if (riskColor) return riskColor;
      }
      if (colorByEcosystem) {
        const ecoColor = ECOSYSTEM_COLORS[node.ecosystem];
        return ecoColor ?? ECOSYSTEM_COLORS.UNKNOWN ?? "#6b7280";
      }
      return "#6366f1";
    },
    [colorByEcosystem, showVulnerabilities]
  );

  // Check if node is in highlight path
  const isInHighlightPath = useCallback(
    (nodeId: string) => {
      return highlightPath?.includes(nodeId) ?? false;
    },
    [highlightPath]
  );

  // Initialize D3 visualization
  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width: w, height: h } = dimensions;

    // Create container group for zoom
    const container = svg.append("g").attr("class", "container");

    // Zoom behavior
    if (enableZoom) {
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          container.attr("transform", event.transform);
        });

      svg.call(zoom);

      // Initial zoom to fit
      const initialScale = 0.9;
      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(w / 2, h / 2)
          .scale(initialScale)
          .translate(-w / 2, -h / 2)
      );
    }

    // Arrow marker for links
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .append("path")
      .attr("d", "M 0,-5 L 10,0 L 0,5")
      .attr("fill", "#9ca3af");

    // Create simulation
    const simulation = d3
      .forceSimulation<GraphNode>(data.nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(data.links)
          .id((d) => d.id)
          .distance(80)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide().radius(25));

    // Draw links
    const links = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(data.links)
      .join("line")
      .attr("stroke", (d) => {
        const sourceId = typeof d.source === "string" ? d.source : d.source.id;
        const targetId = typeof d.target === "string" ? d.target : d.target.id;
        if (isInHighlightPath(sourceId) && isInHighlightPath(targetId)) {
          return "#fbbf24";
        }
        return d.type === "devDependency" ? "#9ca3af" : "#6b7280";
      })
      .attr("stroke-width", (d) => {
        const sourceId = typeof d.source === "string" ? d.source : d.source.id;
        const targetId = typeof d.target === "string" ? d.target : d.target.id;
        if (isInHighlightPath(sourceId) && isInHighlightPath(targetId)) {
          return 3;
        }
        return 1.5;
      })
      .attr("stroke-dasharray", (d) => (d.type === "devDependency" ? "4,4" : "none"))
      .attr("marker-end", "url(#arrowhead)")
      .attr("opacity", 0.6);

    // Draw nodes
    const nodes = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(data.nodes)
      .join("g")
      .attr("class", "node")
      .style("cursor", "pointer");

    // Node circles
    nodes
      .append("circle")
      .attr("r", (d) => getNodeRadius(d))
      .attr("fill", (d) => getNodeColor(d))
      .attr("stroke", (d) => {
        if (d.id === selectedNodeId) return "#3b82f6";
        if (isInHighlightPath(d.id)) return "#fbbf24";
        return "#fff";
      })
      .attr("stroke-width", (d) => {
        if (d.id === selectedNodeId) return 3;
        if (isInHighlightPath(d.id)) return 2;
        return 1.5;
      });

    // Vulnerability indicator
    if (showVulnerabilities) {
      nodes
        .filter((d) => d.hasVulnerabilities === true && (d.vulnerabilityCount ?? 0) > 0)
        .append("text")
        .attr("class", "vuln-count")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#fff")
        .attr("font-size", "10px")
        .attr("font-weight", "bold")
        .text((d) => d.vulnerabilityCount ?? "!");
    }

    // Labels
    if (showLabels) {
      nodes
        .append("text")
        .attr("class", "label")
        .attr("dx", (d) => getNodeRadius(d) + 4)
        .attr("dy", "0.35em")
        .attr("fill", "currentColor")
        .attr("font-size", (d) => (d.isRoot ? "12px" : "10px"))
        .attr("font-weight", (d) => (d.isRoot ? "600" : "400"))
        .text((d) => {
          // Truncate long names
          const maxLen = d.isRoot ? 25 : 15;
          return d.name.length > maxLen ? `${d.name.slice(0, maxLen)}...` : d.name;
        });
    }

    // Drag behavior
    if (enableDrag) {
      const drag = d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes.call(drag as any);
    }

    // Event handlers
    nodes
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick?.(d);
      })
      .on("mouseenter", (event, d) => {
        setHoveredNode(d);
        onNodeHover?.(d);
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
        onNodeHover?.(null);
      });

    // Update positions on tick
    simulation.on("tick", () => {
      links
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      nodes.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [
    data,
    dimensions,
    getNodeRadius,
    getNodeColor,
    isInHighlightPath,
    selectedNodeId,
    showLabels,
    showVulnerabilities,
    enableZoom,
    enableDrag,
    onNodeClick,
    onNodeHover,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full min-h-[400px]", className)}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="bg-gray-50 dark:bg-gray-900 rounded-lg"
      />

      {/* Tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-10 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 pointer-events-none"
          style={{
            left: (hoveredNode.x ?? 0) + 30,
            top: (hoveredNode.y ?? 0) - 20,
          }}
        >
          <p className="font-medium text-sm">{hoveredNode.name}</p>
          <p className="text-xs text-gray-500">{hoveredNode.ecosystem}</p>
          {hoveredNode.hasVulnerabilities && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {hoveredNode.vulnerabilityCount} vulnerabilities
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTROLS COMPONENT
// ═══════════════════════════════════════════════════════════════

export interface GraphControlsProps {
  showLabels: boolean;
  onShowLabelsChange: (show: boolean) => void;
  showVulnerabilities: boolean;
  onShowVulnerabilitiesChange: (show: boolean) => void;
  colorByEcosystem: boolean;
  onColorByEcosystemChange: (color: boolean) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  className?: string;
}

export function GraphControls({
  showLabels,
  onShowLabelsChange,
  showVulnerabilities,
  onShowVulnerabilitiesChange,
  colorByEcosystem,
  onColorByEcosystemChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  className,
}: GraphControlsProps) {
  return (
    <div className={cn("flex items-center gap-4 p-2 bg-white dark:bg-gray-800 rounded-lg shadow", className)}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showLabels}
          onChange={(e) => onShowLabelsChange(e.target.checked)}
          className="rounded"
        />
        Labels
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showVulnerabilities}
          onChange={(e) => onShowVulnerabilitiesChange(e.target.checked)}
          className="rounded"
        />
        Vulnerabilities
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={colorByEcosystem}
          onChange={(e) => onColorByEcosystemChange(e.target.checked)}
          className="rounded"
        />
        Color by Ecosystem
      </label>

      <div className="flex items-center gap-1 ml-auto">
        {onZoomIn && (
          <button
            onClick={onZoomIn}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            aria-label="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
        )}
        {onZoomOut && (
          <button
            onClick={onZoomOut}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            aria-label="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
        )}
        {onResetView && (
          <button
            onClick={onResetView}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            aria-label="Reset view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEGEND COMPONENT
// ═══════════════════════════════════════════════════════════════

export function GraphLegend({ className }: { className?: string }) {
  return (
    <div className={cn("p-3 bg-white dark:bg-gray-800 rounded-lg shadow text-sm", className)}>
      <h4 className="font-medium mb-2">Legend</h4>

      <div className="space-y-2">
        <div>
          <p className="text-xs text-gray-500 mb-1">Ecosystems</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ECOSYSTEM_COLORS).slice(0, -1).map(([name, color]) => (
              <div key={name} className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs">{name}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Risk Levels</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(RISK_COLORS).map(([name, color]) => (
              <div key={name} className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs">{name}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Link Types</p>
          <div className="flex gap-3">
            <div className="flex items-center gap-1">
              <span className="w-4 h-0.5 bg-gray-600" />
              <span className="text-xs">Direct</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-gray-400" />
              <span className="text-xs">Dev</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DependencyGraph;
