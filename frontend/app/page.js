import { getServerSession } from "next-auth/next";
import Link from "next/link";
import DashboardClient from "./DashboardClient";
import AppShell from "./components/AppShell";
import { authOptions } from "../lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <>
      {session ? (
        <AppShell>
          <DashboardClient />
        </AppShell>
      ) : (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "40px 20px",
            background:
              "linear-gradient(135deg, rgba(255, 239, 214, 0.6), rgba(217, 233, 255, 0.6))"
          }}
        >
          <section
            style={{
              maxWidth: "520px",
              background: "rgba(255, 255, 255, 0.9)",
              borderRadius: "24px",
              padding: "32px",
              boxShadow: "0 20px 40px rgba(20, 24, 36, 0.12)"
            }}
          >
            <p
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "12px",
                margin: "0 0 10px",
                color: "#6b6f78"
              }}
            >
              Monetra
            </p>
            <h1 style={{ margin: "0 0 10px" }}>Financial clarity, at a glance.</h1>
            <p style={{ margin: "0 0 24px", color: "#666a73" }}>
              Sign in to see your read-only dashboard with account activity and
              current month net flow.
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link
                href="/login"
                style={{
                  borderRadius: "999px",
                  padding: "10px 18px",
                  background: "#2e2f33",
                  color: "#f7f4ef",
                  textDecoration: "none"
                }}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                style={{
                  borderRadius: "999px",
                  padding: "10px 18px",
                  border: "1px solid #2e2f33",
                  color: "#2e2f33",
                  textDecoration: "none"
                }}
              >
                Sign up
              </Link>
            </div>
          </section>
        </main>
      )}
    </>
  );
}
