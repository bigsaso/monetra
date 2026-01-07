import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import AccountsClient from "./AccountsClient";
import { authOptions } from "../../../lib/auth";

export default async function AccountsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return <AccountsClient />;
}
