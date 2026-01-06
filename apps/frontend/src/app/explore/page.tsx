"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useLazyQuery } from "@apollo/client";
import {
  Search,
  Package,
  SlidersHorizontal,
  Loader2,
  Sparkles,
} from "lucide-react";
import { GET_PACKAGE, GET_REVERSE_DEPENDENTS, SEARCH_PACKAGES, SEMANTIC_SEARCH_PACKAGES } from "@/lib/graphql/queries";
import { PackageCard } from "@/components/explore/package-card";
import { PackageDetail } from "@/components/explore/package-detail";
import { EcosystemFilter } from "@/components/explore/ecosystem-filter";
import { SearchInput } from "@/components/ui/search-input";
import { SkeletonCard } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/error-display";

function ExplorePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") || "";
  const initialEcosystem = searchParams.get("ecosystem")?.toUpperCase() || "ALL";
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedEcosystem, setSelectedEcosystem] = useState(initialEcosystem);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);

  const useSemanticSearch =
    (process.env.NEXT_PUBLIC_SEARCH_MODE || "").toLowerCase() === "semantic";

  // Direct package lookup (for exact ID matches)
  const [getPackage, { data: packageData, loading: packageLoading, error: packageError }] = 
    useLazyQuery(GET_PACKAGE);

  // Fuzzy search for packages
  const [searchPackagesByName, { data: nameSearchData, loading: nameSearchLoading, error: nameSearchError, fetchMore: fetchMoreNameSearch }] = 
    useLazyQuery(SEARCH_PACKAGES);

  const [searchPackagesSemantic, { data: semanticSearchData, loading: semanticSearchLoading, error: semanticSearchError, fetchMore: fetchMoreSemanticSearch }] = 
    useLazyQuery(SEMANTIC_SEARCH_PACKAGES);

  const [getReverseDeps, { data: reverseDepsData, loading: reverseDepsLoading, fetchMore }] = 
    useLazyQuery(GET_REVERSE_DEPENDENTS);

  const foundPackage = packageData?.package;
  const searchConnection = useSemanticSearch
    ? semanticSearchData?.semanticSearchPackages
    : nameSearchData?.searchPackages;

  const searchResults: Array<{
    node: { id: string; name: string; ecosystem: string };
    cursor: string;
    score?: number;
  }> = searchConnection?.edges || [];

  const isLoading = packageLoading || nameSearchLoading || semanticSearchLoading;
  const error = packageError || nameSearchError || semanticSearchError;

  // Handle selecting a package from reverse deps list
  const handleSelectPackage = useCallback((packageId: string) => {
    setSearchQuery(packageId);
    setSelectedPackageId(packageId);
    router.push(`/explore?q=${encodeURIComponent(packageId)}`);
    getPackage({ variables: { id: packageId } });
  }, [router, getPackage]);

  // Load more reverse deps handler
  const handleLoadMore = useCallback(() => {
    if (reverseDepsData?.reverseDependents?.pageInfo.endCursor && fetchMore) {
      fetchMore({
        variables: {
          after: reverseDepsData.reverseDependents.pageInfo.endCursor,
        },
      });
    }
  }, [reverseDepsData, fetchMore]);

  // Search handler - uses fuzzy search or direct lookup
  const handleSearch = useCallback((query: string) => {
    if (query.trim()) {
      // Update URL
      router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
      
      // Check if it's an exact package ID format (ecosystem:name)
      const isExactId = query.includes(":");
      
      if (isExactId) {
        // Direct package lookup
        getPackage({ variables: { id: query.trim() } });
      } else {
        // Search
        const ecosystemFilter = selectedEcosystem !== "ALL" ? selectedEcosystem : undefined;
        const variables = {
          query: query.trim(),
          ecosystem: ecosystemFilter,
          first: 20,
        };

        if (useSemanticSearch) {
          searchPackagesSemantic({ variables });
        } else {
          searchPackagesByName({ variables });
        }
      }
    }
  }, [router, getPackage, searchPackagesByName, searchPackagesSemantic, selectedEcosystem, useSemanticSearch]);

  const handleLoadMoreSearch = useCallback(async () => {
    const endCursor = searchConnection?.pageInfo?.endCursor;
    const hasNextPage = Boolean(searchConnection?.pageInfo?.hasNextPage);
    if (!hasNextPage || !endCursor) return;

    const ecosystemFilter = selectedEcosystem !== "ALL" ? selectedEcosystem : undefined;
    const variables = {
      query: searchQuery.trim(),
      ecosystem: ecosystemFilter,
      first: 20,
      after: endCursor,
    };

    setIsLoadingMoreSearch(true);
    try {
      if (useSemanticSearch && fetchMoreSemanticSearch) {
        await fetchMoreSemanticSearch({
          variables,
          updateQuery: (prev, { fetchMoreResult }) => {
            if (!fetchMoreResult?.semanticSearchPackages) return prev;
            const prevConn = prev.semanticSearchPackages;
            const nextConn = fetchMoreResult.semanticSearchPackages;
            return {
              ...prev,
              semanticSearchPackages: {
                ...prevConn,
                edges: [...(prevConn?.edges || []), ...(nextConn.edges || [])],
                pageInfo: nextConn.pageInfo,
                totalCount: nextConn.totalCount,
              },
            };
          },
        });
      }

      if (!useSemanticSearch && fetchMoreNameSearch) {
        await fetchMoreNameSearch({
          variables,
          updateQuery: (prev, { fetchMoreResult }) => {
            if (!fetchMoreResult?.searchPackages) return prev;
            const prevConn = prev.searchPackages;
            const nextConn = fetchMoreResult.searchPackages;
            return {
              ...prev,
              searchPackages: {
                ...prevConn,
                edges: [...(prevConn?.edges || []), ...(nextConn.edges || [])],
                pageInfo: nextConn.pageInfo,
                totalCount: nextConn.totalCount,
              },
            };
          },
        });
      }
    } finally {
      setIsLoadingMoreSearch(false);
    }
  }, [fetchMoreNameSearch, fetchMoreSemanticSearch, searchConnection, searchQuery, selectedEcosystem, useSemanticSearch]);

  // Auto-search if query param exists
  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
      // Check if it's an exact ID or fuzzy search
      if (initialQuery.includes(":")) {
        getPackage({ variables: { id: initialQuery } });
      } else {
        const ecosystemFilter = initialEcosystem !== "ALL" ? initialEcosystem : undefined;
        const variables = { query: initialQuery, ecosystem: ecosystemFilter, first: 20 };
        if (useSemanticSearch) {
          searchPackagesSemantic({ variables });
        } else {
          searchPackagesByName({ variables });
        }
      }
    }
  }, [initialQuery, initialEcosystem, getPackage, searchPackagesByName, searchPackagesSemantic, useSemanticSearch]);

  // Load reverse deps when package is selected
  useEffect(() => {
    if (selectedPackageId) {
      getReverseDeps({ 
        variables: { 
          packageId: selectedPackageId, 
          maxDepth: 2, 
          first: 20 
        } 
      });
    }
  }, [selectedPackageId, getReverseDeps]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold theme-text-primary flex items-center gap-3">
            <Package className="w-8 h-8 text-primary-400" />
            Explore Packages
          </h1>
          <p className="theme-text-muted mt-1">
            Search and explore packages across all ecosystems
          </p>
        </div>
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6"
      >
        <div className="space-y-4">
          {/* Search Input with Autocomplete */}
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
            placeholder="Enter package ID (e.g., npm:express, pypi:requests, cargo:tokio)"
            isLoading={packageLoading}
          />

          {/* Ecosystem Filter */}
          <EcosystemFilter
            selected={selectedEcosystem}
            onSelect={(ecosystem) => {
              setSelectedEcosystem(ecosystem);
              // Re-search if we have a query
              if (searchQuery.trim() && !searchQuery.includes(":")) {
                handleSearch(searchQuery);
              }
            }}
          />
        </div>
      </motion.div>

      {/* Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Results */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-semibold theme-text-primary flex items-center gap-2">
            <Search className="w-5 h-5 text-primary-400" />
            Search Results
          </h2>

          {/* Loading State */}
          {isLoading && (
            <SkeletonCard />
          )}

          {/* Error State */}
          {error && (
            <QueryError
              error={error}
              onRetry={() => searchQuery && handleSearch(searchQuery)}
              minimal
            />
          )}

          {/* No Results */}
          {!isLoading && !foundPackage && searchResults.length === 0 && searchQuery && !error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-8 text-center"
            >
              <Package className="w-12 h-12 theme-text-faint mx-auto mb-4" />
              <p className="theme-text-tertiary font-medium">No package found</p>
              <p className="text-sm theme-text-faint mt-1">
                Try searching with format: ecosystem:name
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {["cargo:", "npm:", "pypi:"].map((prefix) => (
                  <button
                    key={prefix}
                    onClick={() => setSearchQuery(prefix)}
                    className="px-3 py-1.5 rounded-lg theme-pill
                             theme-hover-text theme-inner-card-hover transition-colors"
                  >
                    {prefix}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Found Package (exact match) */}
          {foundPackage && (
            <PackageCard
              package={foundPackage}
              onClick={() => setSelectedPackageId(foundPackage.id)}
              isSelected={selectedPackageId === foundPackage.id}
            />
          )}

          {/* Search Results (fuzzy search) */}
          {searchResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm theme-text-tertiary">
                Found {searchConnection?.totalCount || searchResults.length} packages
              </p>
              {searchResults.map(({ node, score }) => (
                <PackageCard
                  key={node.id}
                  package={{ ...node, ecosystem: node.ecosystem as "NPM" | "PY_PI" | "CARGO" | "MAVEN" | "NU_GET" | "GO" }}
                  onClick={() => setSelectedPackageId(node.id)}
                  isSelected={selectedPackageId === node.id}
                  score={useSemanticSearch ? score : undefined}
                />
              ))}

              {searchConnection?.pageInfo?.hasNextPage && (
                <div className="pt-2">
                  <button
                    onClick={handleLoadMoreSearch}
                    disabled={isLoadingMoreSearch || isLoading}
                    className="w-full px-4 py-2 rounded-lg theme-inner-card theme-hover-text theme-inner-card-hover transition-colors"
                  >
                    {isLoadingMoreSearch ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Example Searches */}
          {!searchQuery && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-6"
            >
              <h3 className="text-sm font-medium theme-text-tertiary mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent-400" />
                Try searching for:
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {["cargo:tokio", "pypi:requests", "npm:express", "cargo:serde", "pypi:flask", "cargo:clap"].map(
                  (example, index) => (
                    <motion.button
                      key={example}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + index * 0.05 }}
                      onClick={() => {
                        setSearchQuery(example);
                        handleSearch(example);
                      }}
                      className="px-3 py-2 rounded-lg theme-inner-card text-sm theme-text-tertiary 
                               theme-hover-text hover:bg-primary-600/20 hover:border-primary-500/30
                               border border-transparent transition-all font-mono text-left"
                    >
                      {example}
                    </motion.button>
                  )
                )}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Package Detail */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-semibold theme-text-primary flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-accent-400" />
            Package Details
          </h2>

          <AnimatePresence mode="wait">
            {selectedPackageId ? (
              <PackageDetail
                key={selectedPackageId}
                packageId={selectedPackageId}
                reverseDeps={reverseDepsData?.reverseDependents}
                loading={reverseDepsLoading}
                onClose={() => setSelectedPackageId(null)}
                onSelectPackage={handleSelectPackage}
                onLoadMore={handleLoadMore}
              />
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card p-8 text-center"
              >
                <SlidersHorizontal className="w-12 h-12 theme-text-faint mx-auto mb-4" />
                <p className="theme-text-tertiary font-medium">Select a package</p>
                <p className="text-sm theme-text-faint mt-1">
                  Click on a package to view details and dependencies
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      }
    >
      <ExplorePageContent />
    </Suspense>
  );
}
