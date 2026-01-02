"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Map, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MinimapNode {
  id: string;
  x: number;
  y: number;
  color: string;
  depth: number;
}

interface MinimapProps {
  nodes: MinimapNode[];
  viewBox: { x: number; y: number; width: number; height: number };
  onNavigate?: (x: number, y: number) => void;
  className?: string;
  width?: number;
  height?: number;
}

export function GraphMinimap({
  nodes,
  viewBox,
  onNavigate,
  className,
  width = 180,
  height = 120,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate bounds of all nodes
  const bounds = useCallback(() => {
    if (nodes.length === 0) {
      return { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }
    
    // Add padding
    const padding = 50;
    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
    };
  }, [nodes]);

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, width, height);

    const { minX, maxX, minY, maxY } = bounds();
    const scaleX = width / (maxX - minX);
    const scaleY = height / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;

    // Draw nodes
    for (const node of nodes) {
      const x = (node.x - minX) * scale + offsetX;
      const y = (node.y - minY) * scale + offsetY;
      const radius = node.depth === 0 ? 4 : 2;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();
    }

    // Draw viewport rectangle
    if (viewBox.width > 0 && viewBox.height > 0) {
      const vx = (viewBox.x - minX) * scale + offsetX;
      const vy = (viewBox.y - minY) * scale + offsetY;
      const vw = viewBox.width * scale;
      const vh = viewBox.height * scale;
      
      ctx.strokeStyle = "rgba(99, 102, 241, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(vx, vy, vw, vh);
      
      ctx.fillStyle = "rgba(99, 102, 241, 0.1)";
      ctx.fillRect(vx, vy, vw, vh);
    }
  }, [nodes, viewBox, width, height, bounds]);

  // Handle click to navigate
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onNavigate) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { minX, maxX, minY, maxY } = bounds();
    const scaleX = width / (maxX - minX);
    const scaleY = height / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    
    const worldX = (x - offsetX) / scale + minX;
    const worldY = (y - offsetY) / scale + minY;
    
    onNavigate(worldX, worldY);
  }, [onNavigate, bounds, width, height]);

  if (!isExpanded) {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setIsExpanded(true)}
        className={cn(
          "glass-card p-2 cursor-pointer hover:bg-primary-500/10 transition-colors",
          className
        )}
        title="Show Minimap"
      >
        <Map className="w-5 h-5 theme-text-muted" />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("glass-card overflow-hidden", className)}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b theme-border">
        <span className="text-xs font-medium theme-text-muted flex items-center gap-1.5">
          <Map className="w-3 h-3" />
          Minimap
        </span>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Collapse"
        >
          <Minimize2 className="w-3 h-3 theme-text-faint" />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        className={cn(
          "cursor-crosshair",
          isDragging && "cursor-grabbing"
        )}
        style={{ width, height }}
      />
    </motion.div>
  );
}
