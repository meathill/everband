import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/import")({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { orgId: params.orgId },
      search: { section: "data-import" },
      to: "/o/$orgId/settings",
    });
  },
});
