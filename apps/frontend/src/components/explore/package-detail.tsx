"use client";

import { motion } from "framer-motion";
import {
  X,
  GitBranch,
  Package,
  ArrowUpRight,
  Loader2,
  Users,
  Layers,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn, formatEcosystemName, getEcosystemBadgeClass, getEcosystemColor, parsePackageId } from "@/lib/utils";
import { PackageConnection } from "@/lib/graphql/types";

interface PackageDetailProps {
  packageId: string;
  reverseDeps?: PackageConnection;
  loading?: boolean;
  onClose: () => void;
  onSelectPackage?: (packageId: string) => void;
  onLoadMore?: () => void;
}

export function PackageDetail({
  packageId,
  reverseDeps,
  loading,
  onClose,
  onSelectPackage,
  onLoadMore,
}: PackageDetailProps) {
  const { ecosystem, name } = parsePackageId(packageId);

  const registryLinks: Record<string, string> = {
    npm: `https://www.npmjs.com/package/${name}`,
    pypi: `https://pypi.org/project/${name}`,
    py_pi: `https://pypi.org/project/${name}`,
    cargo: `https://crates.io/crates/${name}`,
    maven: `https://mvnrepository.com/artifact/${name}`,
    nuget: `https://www.nuget.org/packages/${name}`,
    go: `https://pkg.go.dev/${name}`,
  };

  const registryLink = registryLinks[ecosystem.toLowerCase()];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass-card overflow-hidden"
    >
      {/* Header */}
      <div
        className="px-6 py-5 border-b theme-border"
        style={{
          background: `linear-gradient(135deg, ${getEcosystemColor(ecosystem)}15, transparent)`,
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: `${getEcosystemColor(ecosystem)}20` }}
            >
              <Package
                className="w-7 h-7"
                style={{ color: getEcosystemColor(ecosystem) }}
              />
            </div>
            <div>
              <h2 className="text-xl font-bold theme-text-primary">{name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    getEcosystemBadgeClass(ecosystem)
                  )}
                >
                  {formatEcosystemName(ecosystem)}
                </span>
                {registryLink && (
                  <a
                    href={registryLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs theme-text-muted hover:text-primary-400 flex items-center gap-1 transition-colors"
                  >
                    View on registry
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg theme-interactive transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 p-6 border-b theme-border">
        <div className="flex items-center gap-3 p-4 rounded-xl theme-inner-card">
          <Users className="w-5 h-5 text-primary-400" />
          <div>
            <p className="text-2xl font-bold theme-text-primary">
              {reverseDeps?.totalCount ?? "..."}
            </p>
            <p className="text-xs theme-text-muted">Reverse Dependents</p>
          </div>
        </div>
        <Link
          href={`/graph?pkg=${encodeURIComponent(packageId)}`}
          className="flex items-center gap-3 p-4 rounded-xl theme-inner-card theme-inner-card-hover transition-colors group"
        >
          <GitBranch className="w-5 h-5 text-accent-400" />
          <div>
            <p className="text-sm font-medium theme-text-primary group-hover:text-accent-300 transition-colors">
              View Graph
            </p>
            <p className="text-xs theme-text-muted">Explore dependencies</p>
          </div>
          <ArrowUpRight className="w-4 h-4 theme-text-faint ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>

      {/* Reverse Dependents List */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold theme-text-tertiary flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary-400" />
            Reverse Dependents
          </h3>
          {reverseDeps && reverseDeps.totalCount > 0 && (
            <Link
              href={`/graph?pkg=${encodeURIComponent(packageId)}&mode=reverse`}
              className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              View all →
            </Link>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        )}

        {/* Dependents List */}
        {!loading && reverseDeps && (
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
            {reverseDeps.edges.length === 0 ? (
              <p className="text-center theme-text-faint py-6">
                No reverse dependents found
              </p>
            ) : (
              reverseDeps.edges.map((edge, index) => (
                <motion.div
                  key={edge.node.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center gap-3 p-3 rounded-lg theme-inner-card theme-inner-card-hover hover:bg-primary-500/10 transition-colors cursor-pointer group"
                  onClick={() => onSelectPackage?.(edge.node.id)}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getEcosystemColor(edge.node.ecosystem) }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium theme-text-primary group-hover:text-primary-400 transition-colors truncate">
                      {edge.node.name}
                    </p>
                    <p className="text-xs theme-text-faint font-mono truncate">
                      {edge.node.id}
                    </p>
                  </div>
                  {edge.depth && (
                    <span className="text-xs theme-text-muted theme-pill px-2 py-1 rounded">
                      depth: {edge.depth}
                    </span>
                  )}
                  <ArrowUpRight className="w-4 h-4 theme-text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* Pagination info */}
        {reverseDeps?.pageInfo.hasNextPage && (
          <div className="text-center mt-4 space-y-2">
            <p className="text-xs theme-text-faint">
              Showing {reverseDeps.edges.length} of {reverseDeps.totalCount} dependents
            </p>
            <button
              onClick={onLoadMore}
              className="px-4 py-2 rounded-lg theme-inner-card text-sm theme-text-tertiary 
                       theme-hover-text hover:bg-primary-600/20 transition-all"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 pb-6 flex gap-3">
        <Link
          href={`/impact?pkg=${encodeURIComponent(packageId)}`}
          className="flex-1 btn-secondary text-center text-sm"
        >
          Impact Analysis
        </Link>
        <Link
          href={`/path?from=${encodeURIComponent(packageId)}`}
          className="flex-1 btn-primary text-center text-sm"
        >
          Find Paths
        </Link>
      </div>
    </motion.div>
  );
}
