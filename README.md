# INSIDER
1. Create a Supabase project; run `supabase/schema.sql` in the SQL editor.
2. `cp .env.example .env.local` and fill the 3 keys (Project Settings → API).
3. `npm install && npm run dev` → open http://localhost:3000 in several tabs/phones.
4. Deploy: push to GitHub, import in Vercel, add the same 3 env vars.
Game rules/timers/word lists: `lib/config.ts`, `lib/words.ts`.
