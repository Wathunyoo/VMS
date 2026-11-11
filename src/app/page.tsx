import { redirect } from "next/navigation";
import { getCurrentUser, homePath } from "@/infrastructure/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homePath(user) : "/login");
}
