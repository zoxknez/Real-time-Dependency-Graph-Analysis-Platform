/**
 * External OSV Package Evidence Client & Port Adapter (WMCP-9)
 *
 * Implements WarRoomEvidencePort with in-memory caching, finite timeouts,
 * deterministic sorting, response bounding, and strict error classification.
 * Connects to fixed server-side OSV endpoint without accepting client-provided URLs.
 * Follows WMCP-INV-001, WMCP-INV-002, WMCP-9 (B1-B16).
 */

import {
  PackageEvidence,
  PackageEvidenceCoordinate,
  PackageAdvisoryFact,
  mapEcosystemToOsv,
} from "../war-room/domain/evidence";
import { WarRoomEvidencePort } from "../war-room/application/ports";

export const DEFAULT_OSV_BASE_URL = "https://api.osv.dev";
export const DEFAULT_EVIDENCE_TIMEOUT_MS = 5000;
export const MAX_RETURNED_ADVISORIES = 20;
export const EVIDENCE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  readonly evidence: PackageEvidence;
  readonly expiresAt: number;
}

export class OsvEvidenceClient implements WarRoomEvidencePort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options?: { baseUrl?: string; timeoutMs?: number }) {
    this.baseUrl = (options?.baseUrl || process.env.OSV_API_BASE || DEFAULT_OSV_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_EVIDENCE_TIMEOUT_MS;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public async getPackageEvidence(
    coordinate: PackageEvidenceCoordinate,
    parentSignal?: AbortSignal
  ): Promise<PackageEvidence> {
    const now = new Date().toISOString();

    // 1. Validate coordinate completeness
    if (!coordinate.packageName || coordinate.packageName.trim().length === 0 || !coordinate.packageVersion || coordinate.packageVersion.trim().length === 0) {
      return {
        coordinate,
        status: "INVALID_COORDINATE",
        provider: "OSV",
        fetchedAt: now,
        advisoriesTotal: 0,
        advisoriesReturned: 0,
        truncated: false,
        advisories: [],
      };
    }

    // 2. Ecosystem check
    const osvEcosystem = mapEcosystemToOsv(coordinate.ecosystem);
    if (!osvEcosystem) {
      return {
        coordinate,
        status: "UNSUPPORTED_ECOSYSTEM",
        provider: "OSV",
        fetchedAt: now,
        advisoriesTotal: 0,
        advisoriesReturned: 0,
        truncated: false,
        advisories: [],
      };
    }

    // 3. Cache check
    const cacheKey = `OSV:${coordinate.ecosystem}:${coordinate.packageName}:${coordinate.packageVersion}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.evidence;
    }

    // 4. Execute HTTP query with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort();
      } else {
        parentSignal.addEventListener("abort", onParentAbort, { once: true });
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          package: {
            name: coordinate.packageName,
            ecosystem: osvEcosystem,
          },
          version: coordinate.packageVersion,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          coordinate,
          status: "UNAVAILABLE",
          provider: "OSV",
          fetchedAt: now,
          advisoriesTotal: 0,
          advisoriesReturned: 0,
          truncated: false,
          advisories: [],
        };
      }

      const raw = await response.json();
      const vulns: any[] = Array.isArray(raw?.vulns) ? raw.vulns : [];

      if (vulns.length === 0) {
        const result: PackageEvidence = {
          coordinate,
          status: "NO_KNOWN_ADVISORIES",
          provider: "OSV",
          fetchedAt: now,
          advisoriesTotal: 0,
          advisoriesReturned: 0,
          truncated: false,
          advisories: [],
        };
        this.cache.set(cacheKey, { evidence: result, expiresAt: Date.now() + EVIDENCE_CACHE_TTL_MS });
        return result;
      }

      // Map facts truthfully without fabricating risk
      const mappedAdvisories: PackageAdvisoryFact[] = vulns.map((v) => ({
        id: String(v.id || "UNKNOWN"),
        aliases: Array.isArray(v.aliases) ? v.aliases.map(String) : undefined,
        summary: typeof v.summary === "string" ? v.summary : undefined,
        details: typeof v.details === "string" ? v.details : undefined,
        published: typeof v.published === "string" ? v.published : undefined,
        modified: typeof v.modified === "string" ? v.modified : undefined,
        references: Array.isArray(v.references)
          ? v.references.map((r: any) => (typeof r?.url === "string" ? r.url : "")).filter(Boolean)
          : undefined,
      }));

      // Deterministic sort by advisory ID ascending
      mappedAdvisories.sort((a, b) => a.id.localeCompare(b.id));

      const advisoriesTotal = mappedAdvisories.length;
      const boundedAdvisories = mappedAdvisories.slice(0, MAX_RETURNED_ADVISORIES);
      const truncated = advisoriesTotal > MAX_RETURNED_ADVISORIES;

      const result: PackageEvidence = {
        coordinate,
        status: "AVAILABLE",
        provider: "OSV",
        fetchedAt: now,
        advisoriesTotal,
        advisoriesReturned: boundedAdvisories.length,
        truncated,
        advisories: boundedAdvisories,
      };

      this.cache.set(cacheKey, { evidence: result, expiresAt: Date.now() + EVIDENCE_CACHE_TTL_MS });
      return result;
    } catch {
      return {
        coordinate,
        status: "UNAVAILABLE",
        provider: "OSV",
        fetchedAt: now,
        advisoriesTotal: 0,
        advisoriesReturned: 0,
        truncated: false,
        advisories: [],
      };
    } finally {
      clearTimeout(timeoutId);
      if (parentSignal) {
        parentSignal.removeEventListener("abort", onParentAbort);
      }
    }
  }
}
