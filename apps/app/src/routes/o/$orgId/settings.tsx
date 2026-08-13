import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@everband/ui/components/tabs";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
  settingsSearchSchema,
} from "@everband/validation";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import type React from "react";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { PublicProfileSection } from "~/components/public-profile-section.tsx";
import { listImportJobs } from "~/server/import.ts";
import { listTerms } from "~/server/members.ts";
import { listEmailSends } from "~/server/notify.ts";
import { listOrgMemberships } from "~/server/org.ts";
import { getPublicProfileSettings } from "~/server/public.ts";
import { DataImportSettingsSection } from "./-components/data-import-settings-section.tsx";
import { EmailSendsTable } from "./-components/email-sends-table.tsx";
import { OrganizationSettingsForm } from "./-components/organization-settings-form.tsx";
import { StaffSettingsSection } from "./-components/staff-settings-section.tsx";
import { TermsSettingsSection } from "./-components/terms-settings-section.tsx";

const SECTION_LABELS: Record<SettingsSection, string> = {
  general: "General",
  "staff-access": "Staff & access",
  terms: "Terms",
  "public-profile": "Public profile",
  "data-import": "Data import",
  "email-delivery": "Email delivery",
};

export const Route = createFileRoute("/o/$orgId/settings")({
  validateSearch: settingsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      const [members, terms, publicProfile, jobs, sends] = await Promise.all([
        listOrgMemberships({ data: { orgId: params.orgId } }),
        listTerms({ data: { orgId: params.orgId } }),
        getPublicProfileSettings({ data: { orgId: params.orgId } }),
        listImportJobs({ data: { orgId: params.orgId, ...deps } }),
        listEmailSends({ data: { orgId: params.orgId } }),
      ]);
      return { members, terms, publicProfile, jobs, sends };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: SettingsPage,
  pendingComponent: PageSkeleton,
});

const orgRoute = getRouteApi("/o/$orgId");

function SettingsPage() {
  const data = Route.useLoaderData();
  const { org, role } = orgRoute.useLoaderData();
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  function changeSection(section: SettingsSection) {
    navigate({
      replace: true,
      search: (current) => ({ ...current, page: 1, section }),
    });
  }

  const panel = (
    <SettingsPanel
      data={data}
      onPageChange={(page) =>
        navigate({ replace: true, search: (current) => ({ ...current, page }) })
      }
      org={org}
      orgId={orgId}
      role={role}
      section={search.section}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Organization setup and operational tools.</p>
      </div>
      <Tabs
        className="items-stretch gap-6 data-[orientation=vertical]:flex-col md:items-start md:gap-8 md:data-[orientation=vertical]:flex-row"
        onValueChange={(value) => changeSection(value as SettingsSection)}
        orientation="vertical"
        value={search.section}
      >
        <div className="w-full md:hidden">
          <Select
            items={SECTION_LABELS}
            onValueChange={(value: SettingsSection | null) => value && changeSection(value)}
            value={search.section}
          >
            <SelectTrigger aria-label="Settings section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SETTINGS_SECTIONS.map((section) => (
                <SelectItem key={section} value={section}>
                  {SECTION_LABELS[section]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TabsList
          className="hidden w-48 shrink-0 items-stretch bg-transparent p-0 md:flex"
          variant="underline"
        >
          {SETTINGS_SECTIONS.map((section) => (
            <TabsTab key={section} value={section}>
              {SECTION_LABELS[section]}
            </TabsTab>
          ))}
        </TabsList>
        <TabsPanel className="w-full min-w-0" value={search.section}>
          {panel}
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function SettingsPanel({
  data,
  onPageChange,
  org,
  orgId,
  role,
  section,
}: {
  data: {
    members: Awaited<ReturnType<typeof listOrgMemberships>>;
    terms: Awaited<ReturnType<typeof listTerms>>;
    publicProfile: Awaited<ReturnType<typeof getPublicProfileSettings>>;
    jobs: Awaited<ReturnType<typeof listImportJobs>>;
    sends: Awaited<ReturnType<typeof listEmailSends>>;
  };
  onPageChange: (page: number) => void;
  org: { id: string; name: string; timezone: string; contactEmail: string | null };
  orgId: string;
  role: string;
  section: SettingsSection;
}): React.ReactElement {
  if (section === "general")
    return <OrganizationSettingsForm isOwner={role === "owner"} org={org} />;
  if (section === "staff-access")
    return <StaffSettingsSection members={data.members} orgId={orgId} />;
  if (section === "terms") return <TermsSettingsSection orgId={orgId} terms={data.terms} />;
  if (section === "public-profile")
    return <PublicProfileSection data={data.publicProfile} orgId={orgId} timezone={org.timezone} />;
  if (section === "data-import")
    return (
      <DataImportSettingsSection
        jobs={data.jobs}
        onPageChange={onPageChange}
        orgId={orgId}
        timezone={org.timezone}
      />
    );
  return <EmailSendsTable rows={data.sends} timezone={org.timezone} />;
}
