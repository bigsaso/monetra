import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ detail: "Symbol required." }, { status: 400 });
  }
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { detail: "Market data API key is not configured." },
      { status: 500 }
    );
  }
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    symbol
  )}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { detail: "Failed to fetch market data." },
      { status: 502 }
    );
  }
  const data = await response.json();
  if (data?.["Error Message"]) {
    return NextResponse.json({ detail: "Quote unavailable." }, { status: 404 });
  }
  if (data?.Note) {
    return NextResponse.json(
      { detail: "Market data provider rate limit reached." },
      { status: 429 }
    );
  }
  const quote = data?.["Global Quote"] || null;
  const priceRaw = quote?.["05. price"];
  if (!quote || priceRaw == null || priceRaw === "") {
    return NextResponse.json({ detail: "Quote unavailable." }, { status: 404 });
  }
  const latestTradingDay = quote?.["07. latest trading day"];
  const timestamp = latestTradingDay
    ? new Date(`${latestTradingDay}T00:00:00Z`).toISOString()
    : null;
  return NextResponse.json({
    price: Number(priceRaw),
    currency: null,
    timestamp
  });
}
