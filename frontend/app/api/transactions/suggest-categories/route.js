import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";

const backendUrl = process.env.BACKEND_URL || "http://backend:8000";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const response = await fetch(`${backendUrl}/transactions/suggest-categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": String(session.user.id),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { detail: "Failed to suggest categories" },
      { status: 500 }
    );
  }
}
