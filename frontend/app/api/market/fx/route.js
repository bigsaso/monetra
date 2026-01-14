import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const base = searchParams.get("base");
  const target = searchParams.get("target");
  if (!base || !target) {
    return NextResponse.json(
      { detail: "Base and target currencies required." },
      { status: 400 }
    );
  }
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { detail: "Failed to fetch FX data." },
      { status: 502 }
    );
  }
  const data = await response.json();
  const rate = data?.rates?.[target];
  if (typeof rate !== "number") {
    return NextResponse.json({ detail: "Rate unavailable." }, { status: 404 });
  }
  return NextResponse.json({
    rate,
    base: base.toUpperCase(),
    target: target.toUpperCase(),
    timestamp: data?.time_last_update_utc || null
  });
}
