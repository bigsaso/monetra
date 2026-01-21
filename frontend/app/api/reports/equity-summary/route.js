import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";

const backendUrl = process.env.BACKEND_URL || "http://backend:8000";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/reports/equity-summary`, {
    headers: { "x-user-id": session.user.id }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
