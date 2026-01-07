import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import PaySchedulesClient from "./PaySchedulesClient";
import { authOptions } from "../../../lib/auth";

export default async function PaySchedulesPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return <PaySchedulesClient />;
}
