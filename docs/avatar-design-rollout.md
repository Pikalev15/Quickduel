# Avatar and shared UI update
- Apply supabase/pending/player_avatars.sql before merging to main. Production build checks table availability. No production changes are part of this PR.
- Public profile icons are 192×192 WebP thumbnails, stored in an RLS-protected table (at most 48 KiB decoded per player). No arbitrary URLs, SVG, animation or original files; Sharp strips metadata. Only a trusted server can write, with auth identity and profile/network limits. Deletion removes the avatar; public GET returns no-store with a fixed content type.
- Existing initials and achievement frames remain. Icons appear in the profile drawer, header, friends and leaderboard surfaces that expose a player code.
- Design tokens use OKLCH and alpha borders, a shared shell and concentric radii, restrained surface gradients, dark-mode elevation, masked decoration, consistent stroke weights and blurred menu icon swaps. Timed gameplay stays outside page transitions; reduced motion respected.
- No claim of complete visual QA until desktop/mobile screenshots and CI have been inspected. Keep Vercel builds batched; merge once after checks and migration preparation.
