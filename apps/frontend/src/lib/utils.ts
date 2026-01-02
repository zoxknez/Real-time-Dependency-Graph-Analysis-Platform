import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + "K";
  }
  return num.toString();
}

export function getEcosystemColor(ecosystem: string): string {
  const colors: Record<string, string> = {
    NPM: "#CB3837",
    PY_PI: "#3775A9",
    PYPI: "#3775A9",
    CARGO: "#DEA584",
    MAVEN: "#C71A36",
    NU_GET: "#004880",
    GO: "#00ADD8",
  };
  return colors[ecosystem.toUpperCase()] || "#6366f1";
}

export function getEcosystemBadgeClass(ecosystem: string): string {
  const classes: Record<string, string> = {
    NPM: "badge-npm",
    PY_PI: "badge-pypi",
    PYPI: "badge-pypi",
    CARGO: "badge-cargo",
    MAVEN: "badge-maven",
    NU_GET: "badge-nuget",
    GO: "badge-go",
  };
  return classes[ecosystem.toUpperCase()] || "badge-npm";
}

export function formatEcosystemName(ecosystem: string): string {
  const names: Record<string, string> = {
    NPM: "npm",
    PY_PI: "PyPI",
    PYPI: "PyPI",
    CARGO: "Cargo",
    MAVEN: "Maven",
    NU_GET: "NuGet",
    GO: "Go",
  };
  return names[ecosystem.toUpperCase()] || ecosystem;
}

export function parsePackageId(id: string): { ecosystem: string; name: string } {
  const [ecosystem, ...nameParts] = id.split(":");
  return {
    ecosystem: ecosystem || "unknown",
    name: nameParts.join(":") || id,
  };
}
