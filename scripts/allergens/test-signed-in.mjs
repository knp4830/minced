// Signed-in check against the private local stack: signs the local test user in, then calls /api/me/allergens and
// /api/me with the session cookie and prints what comes back. Reads .env.development.local; prints no secrets.
//   node scripts/allergens/test-signed-in.mjs [port]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.development.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const port = process.argv[2] ?? "4603";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const { data, error } = await sb.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
if (error) throw error;
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const cookie = `sb-${host}-auth-token=${value}`;
for (const path of ["/api/me/allergens", "/api/me"]) {
  const res = await fetch(`http://localhost:${port}${path}`, { headers: { cookie } });
  const body = await res.json();
  console.log(path, res.status, JSON.stringify({ ...body, favorites: undefined }));
}
console.log("signed out:", JSON.stringify(await (await fetch(`http://localhost:${port}/api/me/allergens`)).json()));
