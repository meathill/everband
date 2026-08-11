import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/groups")({
  beforeLoad: ({ params }) => {
    throw redirect({ params: { orgId: params.orgId }, to: "/o/$orgId/members" });
  },
});
