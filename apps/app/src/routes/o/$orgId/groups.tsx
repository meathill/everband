import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { createGroup, listGroups } from "~/server/members.ts";

export const Route = createFileRoute("/o/$orgId/groups")({
  loader: async ({ params }) => {
    try {
      return { groups: await listGroups({ data: { orgId: params.orgId } }) };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: GroupsPage,
});

function GroupsPage() {
  const { groups } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await createGroup({ data: { orgId, name } });
      if (result.ok) {
        setName("");
        await router.invalidate();
      } else {
        setError(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Groups</h1>

      <form onSubmit={handleCreate} className="flex max-w-md gap-2">
        <Input
          aria-label="Group name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Senior band"
        />
        <Button type="submit" loading={isBusy}>
          Create group
        </Button>
      </form>
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}

      {groups.length === 0 ? (
        <p className="text-muted-foreground">No groups yet. Active students must belong to one.</p>
      ) : (
        <ul className="flex max-w-md flex-col gap-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
            >
              <span className="font-medium text-foreground">{group.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{group.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
