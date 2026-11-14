import type { Metadata } from "next";
import { Suspense } from "react";

import { SettingsView } from "@/components/settings/settings-view";
import { TopBar } from "@/components/workspace/shell";
import { SettingsSkeleton } from "@/components/workspace/skeletons";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getUsageOverview } from "@/server/billing/usage";

export const metadata: Metadata = { title: "Settings" };

async function Settings() {
  const user = await requireCurrentUser();
  // Always the signed-in user's own usage; the id never comes from the client.
  const usage = await getUsageOverview(user.id);
  return <SettingsView usage={usage} />;
}

export default function SettingsPage() {
  return (
    <>
      <TopBar>
        <h1 className="px-1.5 text-sm font-medium">Settings</h1>
      </TopBar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<SettingsSkeleton />}>
          <Settings />
        </Suspense>
      </div>
    </>
  );
}
