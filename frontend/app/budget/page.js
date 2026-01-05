import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import BudgetClient from "./BudgetClient";
import { authOptions } from "../../lib/auth";

export default async function BudgetPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return (
    <main>
      <BudgetClient />
    </main>
  );
}
