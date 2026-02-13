#!/usr/bin/env npx tsx
/**
 * marksyncr.com Stats Dashboard
 * Usage: npx tsx scripts/stats.ts
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function count(table: string, filter?: Record<string, unknown>) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      if (val === null) q = q.is(col, null);
      else if (typeof val === "string" && val.startsWith("not."))
        q = q.not(col, "is", null);
      else q = q.eq(col, val as string);
    }
  }
  const { count: c, error } = await q;
  if (error) console.error(`  ⚠ ${table}:`, error.message);
  return c ?? 0;
}

async function countSince(table: string, col: string, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { count: c } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(col, since);
  return c ?? 0;
}

function header(title: string) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(50));
}

function line(label: string, value: number | string) {
  console.log(`  ${label.padEnd(35)} ${value}`);
}

async function main() {
  console.log("📊 marksyncr.com Stats Dashboard");
  console.log(`   ${new Date().toISOString()}\n`);

  // ── Users ──
  header("👤 Users");
  const totalUsers = await count("users");
  const newUsers7d = await countSince("users", "created_at", 7);
  const newUsers30d = await countSince("users", "created_at", 30);

  line("Total users", totalUsers);
  line("  New (7 days)", newUsers7d);
  line("  New (30 days)", newUsers30d);

  // ── Subscriptions ──
  header("💳 Subscriptions");
  const totalSubs = await count("subscriptions");
  const activeSubs = await count("subscriptions", { status: "active" });

  line("Total subscriptions", totalSubs);
  line("  Active", activeSubs);

  // ── Bookmarks ──
  header("🔖 Bookmarks");
  const totalBookmarks = await count("cloud_bookmarks");
  const newBookmarks7d = await countSince("cloud_bookmarks", "created_at", 7);
  const newBookmarks30d = await countSince("cloud_bookmarks", "created_at", 30);

  line("Total bookmarks", totalBookmarks);
  line("  New (7 days)", newBookmarks7d);
  line("  New (30 days)", newBookmarks30d);

  // ── Bookmark Versions ──
  header("📋 Bookmark Versions");
  const totalVersions = await count("bookmark_versions");

  line("Total versions", totalVersions);

  // ── Devices ──
  header("📱 Devices");
  const totalDevices = await count("devices");

  line("Total devices", totalDevices);

  // ── Sync ──
  header("🔄 Sync");
  const totalSyncStates = await count("sync_state");
  const totalSyncSources = await count("sync_sources");
  const totalSyncSchedules = await count("sync_schedules");

  line("Sync states", totalSyncStates);
  line("Sync sources", totalSyncSources);
  line("Sync schedules", totalSyncSchedules);

  // ── OAuth ──
  header("🔑 OAuth Tokens");
  const totalOAuth = await count("oauth_tokens");

  line("Total OAuth tokens", totalOAuth);

  // ── Pro Features ──
  header("⭐ Pro Features");
  const totalTags = await count("user_tags");
  const totalAnalytics = await count("bookmark_analytics");
  const totalLinkChecks = await count("link_checks");

  line("User tags", totalTags);
  line("Bookmark analytics", totalAnalytics);
  line("Link checks", totalLinkChecks);

  // ── Extension Sessions ──
  header("🧩 Extension Sessions");
  const totalExtSessions = await count("extension_sessions");

  line("Extension sessions", totalExtSessions);

  // ── User Settings ──
  header("⚙️ User Settings");
  const totalSettings = await count("user_settings");

  line("User settings records", totalSettings);

  console.log(`\n${"═".repeat(50)}\n`);
}

main().catch(console.error);
