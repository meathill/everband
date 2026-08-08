import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { inviteStaff, listOrgMemberships } from "~/server/org.ts";

export const Route = createFileRoute("/o/$orgId/settings")({
  loader: async ({ params }) => {
    try {
      return { members: await listOrgMemberships({ data: { orgId: params.orgId } }) };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { members } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setIsBusy(true);
    try {
      const result = await inviteStaff({ data: { orgId, email } });
      if (result.ok) {
        setMessage("Invitation sent.");
        setEmail("");
        await router.invalidate();
      } else {
        setMessage(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Settings</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-foreground">Staff</h2>
        <form onSubmit={handleInvite} className="flex max-w-md gap-2">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
          />
          <Button type="submit" loading={isBusy}>
            Invite staff
          </Button>
        </form>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-border">
                <td className="py-2 text-foreground">{member.invitedEmail}</td>
                <td className="py-2 text-foreground capitalize">{member.role}</td>
                <td className="py-2 text-muted-foreground capitalize">{member.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
