import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import RecurringSchedulesClient from "./RecurringSchedulesClient";
import { authOptions } from "../../../lib/auth";

export default async function RecurringSchedulesPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return <RecurringSchedulesClient />;
}
