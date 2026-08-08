import { Button } from "@everband/ui/components/button";
import { Card } from "@everband/ui/components/card";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
        <div className="flex flex-col gap-3">
          {orgs.map((org) => (
            <Link key={org.orgId} to="/o/$orgId" params={{ orgId: org.orgId }}>
              <Card className="flex flex-row items-center justify-between px-4 py-3 transition-shadow hover:shadow-md">
                <div>
                  <p className="font-medium text-foreground">{org.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{org.type}</p>
                </div>
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {org.role}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Button render={<Link to="/new-org" />}>Create an organization</Button>
    </main>
  );
}
