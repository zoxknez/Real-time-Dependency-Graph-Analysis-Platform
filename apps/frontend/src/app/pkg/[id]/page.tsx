import { redirect } from "next/navigation";
import { parsePackageId } from "@/lib/utils";

export default async function PackageRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const rawId = decodeURIComponent(resolvedParams.id || "");
  const { ecosystem, name } = parsePackageId(rawId);
  const ecoSlug = encodeURIComponent(ecosystem.toLowerCase());
  const nameSlug = encodeURIComponent(name);
  redirect(`/package/${ecoSlug}/${nameSlug}`);
}
