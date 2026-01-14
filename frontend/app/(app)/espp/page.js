import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import InvestmentsClient from "../investments/InvestmentsClient";
import { authOptions } from "../../../lib/auth";

export default async function EsppPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return <InvestmentsClient view="espp" />;
}
