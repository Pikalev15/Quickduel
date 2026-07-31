import type { Metadata } from "next";
import { ShareResultScreen } from "@/components/share/share-result-screen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGame } from "@/games/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const code = (await params).code.toUpperCase();
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("get_public_match_share", {
      requested_code: code,
    });
    if (!data) return { title: "QuickDuel result" };
    const title = `${getGame(data.game_type).name} result · QuickDuel`;
    const description = data.players
      .map((player: { display_name: string; summary: string }) => `${player.display_name}: ${player.summary}`)
      .join(" vs ");
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: [{ url: `/api/shares/${code}/image`, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [`/api/shares/${code}/image`],
      },
    };
  } catch {
    return { title: "QuickDuel result" };
  }
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return <ShareResultScreen code={(await params).code.toUpperCase()} />;
}
