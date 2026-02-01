/**
 * SBOM Generation Hooks
 * 
 * React hooks for generating Software Bill of Materials (SBOM)
 * in SPDX 2.3 and CycloneDX 1.5 formats.
 */

import { useLazyQuery } from "@apollo/client";
import { useCallback, useState } from "react";
import { GENERATE_SBOM } from "../graphql/queries";
import type {
  SbomFormat,
  SbomEncoding,
  SbomGenerationOptions,
  SbomResult,
  GenerateSbomResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface UseSbomOptions {
  packageId: string;
  format?: SbomFormat;
  encoding?: SbomEncoding;
  includeVulnerabilities?: boolean;
  includeTransitive?: boolean;
}

export interface UseSbomResult {
  sbom: SbomResult | null;
  loading: boolean;
  error: Error | null;
  generate: (options?: Partial<SbomGenerationOptions>) => Promise<SbomResult | null>;
  download: () => void;
  downloadUrl: string | null;
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for generating SBOM on-demand
 */
export function useGenerateSbom(packageId: string): UseSbomResult {
  const [sbomResult, setSbomResult] = useState<SbomResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
  const [executeSbom, { loading, error }] = useLazyQuery<
    GenerateSbomResponse,
    { packageId: string; options: SbomGenerationOptions }
  >(GENERATE_SBOM, {
    fetchPolicy: "network-only", // Always fetch fresh SBOM
    onCompleted: (data) => {
      if (data?.generateSbom) {
        setSbomResult(data.generateSbom);
        
        // Create blob URL for download
        if (data.generateSbom.content) {
          const blob = new Blob([data.generateSbom.content], {
            type: data.generateSbom.encoding === "JSON" 
              ? "application/json" 
              : "application/xml",
          });
          setDownloadUrl(URL.createObjectURL(blob));
        }
      }
    },
  });

  const generate = useCallback(
    async (overrides?: Partial<SbomGenerationOptions>) => {
      const options: SbomGenerationOptions = {
        format: overrides?.format ?? "SPDX",
        encoding: overrides?.encoding ?? "JSON",
        includeVulnerabilities: overrides?.includeVulnerabilities ?? true,
        includeTransitive: overrides?.includeTransitive ?? true,
      };

      const result = await executeSbom({
        variables: { packageId, options },
      });

      return result.data?.generateSbom ?? null;
    },
    [executeSbom, packageId]
  );

  const download = useCallback(() => {
    if (!sbomResult || !downloadUrl) return;

    const extension = sbomResult.encoding === "JSON" ? "json" : "xml";
    const formatName = sbomResult.format === "SPDX" ? "spdx" : "cyclonedx";
    const filename = `sbom-${packageId}-${formatName}.${extension}`;

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [sbomResult, downloadUrl, packageId]);

  return {
    sbom: sbomResult,
    loading,
    error: error ?? null,
    generate,
    download,
    downloadUrl,
  };
}

/**
 * Hook with pre-configured SBOM options
 */
export function useSbom(options: UseSbomOptions): UseSbomResult {
  const {
    packageId,
    format = "SPDX",
    encoding = "JSON",
    includeVulnerabilities = true,
    includeTransitive = true,
  } = options;

  const result = useGenerateSbom(packageId);
  const resultGenerate = result.generate;

  // Auto-generate with provided options
  const generate = useCallback(
    async (overrides?: Partial<SbomGenerationOptions>) => {
      const opts: SbomGenerationOptions = {
        format: overrides?.format ?? format,
        encoding: overrides?.encoding ?? encoding,
        includeVulnerabilities: overrides?.includeVulnerabilities ?? includeVulnerabilities,
        includeTransitive: overrides?.includeTransitive ?? includeTransitive,
      };
      return resultGenerate(opts);
    },
    [resultGenerate, format, encoding, includeVulnerabilities, includeTransitive]
  );

  return {
    ...result,
    generate,
  };
}

/**
 * Get file extension for SBOM format
 */
export function getSbomFileExtension(encoding: SbomEncoding): string {
  return encoding === "JSON" ? "json" : "xml";
}

/**
 * Get MIME type for SBOM format
 */
export function getSbomMimeType(encoding: SbomEncoding): string {
  return encoding === "JSON" ? "application/json" : "application/xml";
}

/**
 * Format SBOM content for display
 */
export function formatSbomContent(content: string, encoding: SbomEncoding): string {
  if (encoding === "JSON") {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }
  return content;
}

export default useGenerateSbom;
