import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Frame, FramePanel } from "@everband/ui/components/frame";
import { ArrowRightIcon, BuildingsIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { FullPageLoader } from "~/components/page-loaders.tsx";
import { listMyOrganizations } from "~/server/org.ts";

export const Route = createFileRoute("/select-org")({
  loader: async () => {
    try {
      return { orgs: await listMyOrganizations() };
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: SelectOrgPage,
  pendingComponent: FullPageLoader,
});

function SelectOrgPage() {
  const { orgs } = Route.useLoaderData();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Your organizations
        </h1>
        <p className="text-muted-foreground">
          {orgs.length > 0
            ? "Choose an organization to continue."
            : "You're not part of any organization yet."}
        </p>
      </div>

      {orgs.length > 0 && (
        <Frame className="gap-2 p-2">
          {orgs.map((org) => (
            <Link key={org.orgId} to="/o/$orgId" params={{ orgId: org.orgId }}>
              <FramePanel className="flex flex-row items-center gap-3 border-0 transition-colors hover:bg-accent/40">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                  <BuildingsIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{org.name}</p>
                  <p className="text-muted-foreground text-sm capitalize">{org.type}</p>
                </div>
                <Badge className="capitalize" variant="secondary">
                  {org.role}
                </Badge>
                <ArrowRightIcon className="shrink-0 text-muted-foreground" />
              </FramePanel>
            </Link>
          ))}
        </Frame>
      )}

      <Button render={<Link to="/new-org" search={{ intent: "create" }} />}>
        Create an organization
      </Button>
    </main>
  );
}
