import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { PublicProfileSection } from "~/components/public-profile-section.tsx";
import { listTerms } from "~/server/members.ts";
import { listOrgMemberships } from "~/server/org.ts";
import { getPublicProfileSettings } from "~/server/public.ts";
import { OrganizationSettingsForm } from "./-components/organization-settings-form.tsx";
import { StaffSettingsSection } from "./-components/staff-settings-section.tsx";
import { TermsSettingsSection } from "./-components/terms-settings-section.tsx";

export const Route = createFileRoute("/o/$orgId/settings")({
  loader: async ({ params }) => {
    try {
      const [members, terms, publicProfile] = await Promise.all([
        listOrgMemberships({ data: { orgId: params.orgId } }),
        listTerms({ data: { orgId: params.orgId } }),
        getPublicProfileSettings({ data: { orgId: params.orgId } }),
      ]);
      return { members, terms, publicProfile };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: SettingsPage,
});

const orgRoute = getRouteApi("/o/$orgId");

function SettingsPage() {
  const { members, terms, publicProfile } = Route.useLoaderData();
  const { org, role } = orgRoute.useLoaderData();
  const { orgId } = Route.useParams();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-semibold text-3xl text-foreground tracking-tight">Settings</h1>

      <OrganizationSettingsForm isOwner={role === "owner"} org={org} />
      <StaffSettingsSection members={members} orgId={orgId} />
      <TermsSettingsSection orgId={orgId} terms={terms} />

      <PublicProfileSection orgId={orgId} timezone={org.timezone} data={publicProfile} />
    </div>
  );
}
