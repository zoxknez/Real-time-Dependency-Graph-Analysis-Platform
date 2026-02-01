"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useLazyQuery } from "@apollo/client";
import {
  Search,
  Loader2,
  Sparkles,
} from "lucide-react";
import { GET_PACKAGE, GET_REVERSE_DEPENDENTS, SEARCH_PACKAGES, SEMANTIC_SEARCH_PACKAGES } from "@/lib/graphql/queries";
import { PackageCard } from "@/components/explore/package-card";
import { PackageDetail } from "@/components/explore/package-detail";
import { EcosystemFilter } from "@/components/explore/ecosystem-filter";
import { SearchInput } from "@/components/ui/search-input";
import { QueryError } from "@/components/ui/error-display";

import { cn } from "@/lib/utils";

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-full flex items-center justify-center bg-surface-950">
          <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
        </div>
      }
    >
      <ExplorePageContent />
    </Suspense>
  );
}



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
  const handleSearch = useCallback((query: string, options?: { replace?: boolean }) => {
    if (query.trim()) {
      // Update URL
      const url = `/explore?q=${encodeURIComponent(query.trim())}`;
      if (options?.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }

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

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery === initialQuery) return;

    const timer = setTimeout(() => {
      // Only search fuzzy queries automatically, exact IDs require Enter/Click
      if (!searchQuery.includes(":")) {
        handleSearch(searchQuery, { replace: true });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch, initialQuery]);

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
    <div className="min-h-screen bg-surface-950 text-white selection:bg-primary-500/30 font-sans">
      {/* Deep Blue Background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-surface-950 to-black z-0 pointer-events-none" />
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20 z-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-8 flex flex-col min-h-screen pt-24">

        {/* Header & Search Section */}
        <div className="flex flex-col gap-6 mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-8"
          >
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-[10px] font-bold text-primary-400 uppercase tracking-widest backdrop-blur-sm">
                <Sparkles className="w-3 h-3 animate-pulse" />
                Global Registry Search
              </div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
                Dependency <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-500">Observatory</span>
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <EcosystemFilter
                selected={selectedEcosystem}
                onSelect={(ecosystem) => {
                  setSelectedEcosystem(ecosystem);
                  if (searchQuery.trim() && !searchQuery.includes(":")) {
                    handleSearch(searchQuery);
                  }
                }}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="w-full relative z-20 group"
          >
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 rounded-2xl opacity-20 group-focus-within:opacity-50 blur-lg transition-all duration-500" />

            <div className="relative">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={handleSearch}
                placeholder="Search packages (e.g., npm:express, cargo:tokio)..."
                isLoading={packageLoading}
                className="w-full bg-surface-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 pl-12 shadow-2xl text-lg text-white placeholder:text-white/30 focus:ring-0 focus:border-primary-500/50 transition-all font-medium"
              />
            </div>
          </motion.div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Results Column */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className={cn(
              "lg:col-span-7 space-y-6",
              selectedPackageId ? "lg:block" : "lg:col-span-12"
            )}
          >
            {/* Loading State */}
            {isLoading && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-white/5 border border-white/5 animate-pulse" />
                ))}
              </div>
            )}

            {/* Error State */}
            {error && (
              <QueryError
                error={error}
                onRetry={() => searchQuery && handleSearch(searchQuery)}
                minimal
              />
            )}

            {/* No Results & Empty State */}
            {!isLoading && !foundPackage && searchResults.length === 0 && (
              <div className="min-h-[400px] flex items-center justify-center">
                {!searchQuery ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-center space-y-8 max-w-2xl mx-auto"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {["cargo:tokio", "pypi:requests", "npm:express", "cargo:serde", "pypi:flask", "cargo:clap"].map(
                        (example, index) => (
                          <motion.button
                            key={example}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + index * 0.05 }}
                            onClick={() => {
                              setSearchQuery(example);
                              handleSearch(example);
                            }}
                            className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary-500/30 hover:bg-white/10 text-sm theme-text-tertiary hover:theme-text-primary transition-all font-mono text-left group"
                          >
                            <span className="opacity-50 group-hover:opacity-100 transition-opacity mr-2">$</span>
                            {example}
                          </motion.button>
                        )
                      )}
                    </div>
                    <p className="text-sm theme-text-muted">
                      Enter a package ID to explore its dependency graph and impact analysis.
                    </p>
                  </motion.div>
                ) : (
                  !error && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center p-12 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md max-w-lg"
                    >
                      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
                        <Search className="w-8 h-8 text-white/50" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">No matching signals</h3>
                      <p className="text-white/50 mb-8">
                        No packages found for "{searchQuery}". Check the ID or try a fuzzy search.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          router.push("/explore");
                        }}
                        className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
                      >
                        Reset Search
                      </button>
                    </motion.div>
                  )
                )}
              </div>
            )}

            {/* Found Package (exact match) */}
            {foundPackage && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <PackageCard
                  package={foundPackage}
                  onClick={() => setSelectedPackageId(foundPackage.id)}
                  isSelected={selectedPackageId === foundPackage.id}
                />
              </motion.div>
            )}

            {/* Search Results (fuzzy search) */}
            {searchResults.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
                    Search Results ({searchConnection?.totalCount || searchResults.length})
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {searchResults.map(({ node, score }, index) => (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <PackageCard
                        package={{ ...node, ecosystem: node.ecosystem as "NPM" | "PY_PI" | "CARGO" | "MAVEN" | "NU_GET" | "GO" }}
                        onClick={() => setSelectedPackageId(node.id)}
                        isSelected={selectedPackageId === node.id}
                        score={useSemanticSearch ? score : undefined}
                      />
                    </motion.div>
                  ))}
                </div>

                {searchConnection?.pageInfo?.hasNextPage && (
                  <div className="pt-4 text-center">
                    <button
                      onClick={handleLoadMoreSearch}
                      disabled={isLoadingMoreSearch || isLoading}
                      className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 text-white font-medium transition-all"
                    >
                      {isLoadingMoreSearch ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading
                        </span>
                      ) : (
                        "Load More Results"
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Details Column */}
          <AnimatePresence>
            {selectedPackageId && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="lg:col-span-5 relative"
              >
                <div className="sticky top-24">
                  <PackageDetail
                    key={selectedPackageId}
                    packageId={selectedPackageId}
                    reverseDeps={reverseDepsData?.reverseDependents}
                    loading={reverseDepsLoading}
                    onClose={() => setSelectedPackageId(null)}
                    onSelectPackage={handleSelectPackage}
                    onLoadMore={handleLoadMore}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div >
  );
}
