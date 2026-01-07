import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import TransactionsClient from "./TransactionsClient";
import { authOptions } from "../../../lib/auth";

export default async function TransactionsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return <TransactionsClient />;
}
