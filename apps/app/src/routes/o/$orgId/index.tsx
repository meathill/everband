import { createFileRoute, getRouteApi } from "@tanstack/react-router";

const orgRoute = getRouteApi("/o/$orgId");

export const Route = createFileRoute("/o/$orgId/")({
  component: OrgOverview,
});

// M2 占位：staff Overview 与 parent Home 的完整内容随 M3-M8 落地
function OrgOverview() {
  const { org, role } = orgRoute.useLoaderData();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{org.name}</h1>
      <p className="text-muted-foreground">
        {role === "parent"
          ? "Your upcoming events and rehearsals will appear here."
          : "Members, events and rehearsals will appear here as you set them up."}
      </p>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-md">
        <div>
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium text-foreground capitalize">{org.type}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Timezone</dt>
          <dd className="font-medium text-foreground">{org.timezone}</dd>
        </div>
      </dl>
    </div>
  );
}
