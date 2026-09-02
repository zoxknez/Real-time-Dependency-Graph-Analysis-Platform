import { NextRequest, NextResponse } from "next/server";
import { OsvEvidenceClient } from "@/lib/evidence/osv-client";
import { parsePackageEcosystem } from "@/lib/war-room/integration/apollo-adapters";

const client = new OsvEvidenceClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ecosystem = parsePackageEcosystem(body?.ecosystem);
    const packageName = typeof body?.packageName === "string" ? body.packageName.trim() : "";
    const packageVersion = typeof body?.packageVersion === "string" ? body.packageVersion.trim() : "";

    if (!ecosystem) {
      return NextResponse.json(
        {
          coordinate: { ecosystem: "UNKNOWN", packageName, packageVersion },
          status: "UNSUPPORTED_ECOSYSTEM",
          provider: "OSV",
          fetchedAt: new Date().toISOString(),
          advisoriesTotal: 0,
          advisoriesReturned: 0,
          truncated: false,
          advisories: [],
        },
        { status: 400 }
      );
    }

    const evidence = await client.getPackageEvidence(
      { ecosystem, packageName, packageVersion },
      request.signal
    );

    return NextResponse.json(evidence, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        coordinate: { ecosystem: "UNKNOWN", packageName: "", packageVersion: "" },
        status: "UNAVAILABLE",
        provider: "OSV",
        fetchedAt: new Date().toISOString(),
        advisoriesTotal: 0,
        advisoriesReturned: 0,
        truncated: false,
        advisories: [],
      },
      { status: 503 }
    );
  }
}
