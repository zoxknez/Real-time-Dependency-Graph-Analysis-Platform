import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const backendUrl =
      process.env.ANALYSIS_BACKEND_URL ||
      process.env.NEXT_PUBLIC_ANALYSIS_ENDPOINT ||
      "http://localhost:8080/analysis/scenarios/evaluate";

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        code: "UNAVAILABLE",
        message: `Scenario analysis service unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 503 }
    );
  }
}
