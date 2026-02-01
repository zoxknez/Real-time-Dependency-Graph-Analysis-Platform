/**
 * License Compliance Hooks
 * 
 * React hooks for license validation, scanning, and compliance
 * based on SPDX license expressions and policies.
 */

import { useQuery, useLazyQuery } from "@apollo/client";
import { useCallback, useState } from "react";
import {
  GET_LICENSE_INFO,
  VALIDATE_LICENSE,
  SCAN_LICENSES,
} from "../graphql/queries";
import type {
  LicenseInfo,
  LicenseValidationResult,
  LicenseScanSummary,
  LicensePolicyPreset,
  CopyleftType,
  LicenseCategory,
  GetLicenseInfoResponse,
  ValidateLicenseResponse,
  ScanLicensesResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface UseLicenseInfoResult {
  license: LicenseInfo | null;
  loading: boolean;
  error: Error | null;
}

export interface UseValidateLicenseResult {
  result: LicenseValidationResult | null;
  loading: boolean;
  error: Error | null;
  validate: (expression: string, policy?: LicensePolicyPreset) => Promise<void>;
  isCompliant: boolean;
  hasWarnings: boolean;
}

export interface UseLicenseScanResult {
  summary: LicenseScanSummary | null;
  loading: boolean;
  error: Error | null;
  scan: (packageId: string, policy?: LicensePolicyPreset) => Promise<void>;
  isCompliant: boolean;
  hasCopyleft: boolean;
  hasUnknown: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch license info by SPDX ID
 */
export function useLicenseInfo(licenseId: string): UseLicenseInfoResult {
  const { data, loading, error } = useQuery<
    GetLicenseInfoResponse,
    { licenseId: string }
  >(GET_LICENSE_INFO, {
    variables: { licenseId },
    skip: !licenseId,
  });

  return {
    license: data?.licenseInfo ?? null,
    loading,
    error: error ?? null,
  };
}

/**
 * Validate a license expression against a policy
 */
export function useValidateLicense(
  initialExpression?: string,
  initialPolicy?: LicensePolicyPreset
): UseValidateLicenseResult {
  const [validateQuery, { data, loading, error }] = useLazyQuery<
    ValidateLicenseResponse,
    { licenseExpression: string; policy?: LicensePolicyPreset }
  >(VALIDATE_LICENSE);

  const result = data?.validateLicense ?? null;

  const validate = useCallback(
    async (expression: string, policy?: LicensePolicyPreset) => {
      await validateQuery({
        variables: {
          licenseExpression: expression,
          policy: policy ?? initialPolicy,
        },
      });
    },
    [validateQuery, initialPolicy]
  );

  const isCompliant = result?.compliant ?? true;
  const hasWarnings = (result?.warnings?.length ?? 0) > 0;

  return {
    result,
    loading,
    error: error ?? null,
    validate,
    isCompliant,
    hasWarnings,
  };
}

/**
 * Scan all licenses for a package's dependencies
 */
export function useLicenseScan(
  packageId?: string,
  policy?: LicensePolicyPreset
): UseLicenseScanResult {
  const [scanQuery, { data, loading, error }] = useLazyQuery<
    ScanLicensesResponse,
    { packageId: string; policy?: LicensePolicyPreset }
  >(SCAN_LICENSES);

  const summary = data?.scanLicenses ?? null;

  const scan = useCallback(
    async (pkgId: string, pol?: LicensePolicyPreset) => {
      await scanQuery({
        variables: {
          packageId: pkgId,
          policy: pol ?? policy,
        },
      });
    },
    [scanQuery, policy]
  );

  const isCompliant = summary?.complianceStatus ?? true;
  const hasCopyleft = (summary?.copyleftCount ?? 0) > 0;
  const hasUnknown = (summary?.unknownCount ?? 0) > 0;

  return {
    summary,
    loading,
    error: error ?? null,
    scan,
    isCompliant,
    hasCopyleft,
    hasUnknown,
  };
}

/**
 * Combined license policy state management
 */
export function useLicensePolicy() {
  const [policy, setPolicy] = useState<LicensePolicyPreset>("DEFAULT");
  const [allowedLicenses, setAllowedLicenses] = useState<string[]>([]);
  const [deniedLicenses, setDeniedLicenses] = useState<string[]>([]);

  const addAllowed = useCallback((license: string) => {
    setAllowedLicenses((prev) => [...prev, license]);
  }, []);

  const removeAllowed = useCallback((license: string) => {
    setAllowedLicenses((prev) => prev.filter((l) => l !== license));
  }, []);

  const addDenied = useCallback((license: string) => {
    setDeniedLicenses((prev) => [...prev, license]);
  }, []);

  const removeDenied = useCallback((license: string) => {
    setDeniedLicenses((prev) => prev.filter((l) => l !== license));
  }, []);

  const reset = useCallback(() => {
    setPolicy("DEFAULT");
    setAllowedLicenses([]);
    setDeniedLicenses([]);
  }, []);

  return {
    policy,
    setPolicy,
    allowedLicenses,
    deniedLicenses,
    addAllowed,
    removeAllowed,
    addDenied,
    removeDenied,
    reset,
  };
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get copyleft badge color classes
 */
export function getCopyleftClasses(copyleft: CopyleftType): string {
  const classes: Record<CopyleftType, string> = {
    NONE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    WEAK: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    STRONG: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    NETWORK: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return classes[copyleft];
}

/**
 * Get category badge color classes
 */
export function getCategoryClasses(category: LicenseCategory): string {
  const classes: Record<LicenseCategory, string> = {
    PERMISSIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    COPYLEFT: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    PROPRIETARY: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    PUBLIC_DOMAIN: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
    UNKNOWN: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return classes[category];
}

/**
 * Format copyleft type for display
 */
export function formatCopyleftType(copyleft: CopyleftType): string {
  const labels: Record<CopyleftType, string> = {
    NONE: "None",
    WEAK: "Weak",
    STRONG: "Strong",
    NETWORK: "Network",
  };
  return labels[copyleft];
}

/**
 * Format category for display
 */
export function formatCategory(category: LicenseCategory): string {
  const labels: Record<LicenseCategory, string> = {
    PERMISSIVE: "Permissive",
    COPYLEFT: "Copyleft",
    PROPRIETARY: "Proprietary",
    PUBLIC_DOMAIN: "Public Domain",
    UNKNOWN: "Unknown",
  };
  return labels[category];
}

/**
 * Get violation severity color
 */
export function getViolationSeverityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case "ERROR":
      return "text-red-600 dark:text-red-400";
    case "WARNING":
      return "text-yellow-600 dark:text-yellow-400";
    case "INFO":
      return "text-blue-600 dark:text-blue-400";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
}

/**
 * Get policy preset description
 */
export function getPolicyDescription(policy: LicensePolicyPreset): string {
  const descriptions: Record<LicensePolicyPreset, string> = {
    DEFAULT: "Standard policy allowing most OSI-approved licenses",
    PERMISSIVE_ONLY: "Only permissive licenses (MIT, Apache, BSD, etc.)",
    ENTERPRISE: "Enterprise-friendly policy excluding AGPL and GPL-3.0",
  };
  return descriptions[policy];
}

/**
 * Common permissive licenses
 */
export const COMMON_PERMISSIVE_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
  "0BSD",
];

/**
 * Common copyleft licenses
 */
export const COMMON_COPYLEFT_LICENSES = [
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "LGPL-2.1-only",
  "LGPL-3.0-only",
  "AGPL-3.0-only",
  "MPL-2.0",
];

export default useLicenseInfo;
