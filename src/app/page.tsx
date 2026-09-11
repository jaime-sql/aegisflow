import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  const q = params.role ? `?role=${encodeURIComponent(params.role)}` : "";
  redirect(`/ops${q}`);
}
