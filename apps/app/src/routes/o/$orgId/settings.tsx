import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { PublicProfileSection } from "~/components/public-profile-section.tsx";
import { createTerm, listTerms } from "~/server/members.ts";
import { inviteStaff, listOrgMemberships } from "~/server/org.ts";
import { getPublicProfileSettings } from "~/server/public.ts";

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

function SettingsPage() {
  const { members, terms, publicProfile } = Route.useLoaderData();
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

      <TermsSection terms={terms} />

      <PublicProfileSection orgId={orgId} data={publicProfile} />
    </div>
  );
}

function TermsSection({ terms }: { terms: Awaited<ReturnType<typeof listTerms>> }) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createTerm({
        data: {
          orgId,
          name: String(form.get("name")),
          startDate: String(form.get("startDate")),
          endDate: String(form.get("endDate")),
        },
      });
      if (result.ok) {
        (event.target as HTMLFormElement).reset();
        await router.invalidate();
      } else {
        setError(result.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">School terms</h2>
      <p className="text-sm text-muted-foreground">
        Rehearsals repeat weekly inside a term. Dates use the organization timezone.
      </p>
      <form onSubmit={handleCreate} className="flex max-w-2xl flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5" htmlFor="term-name">
          <span className="text-sm font-medium text-foreground">Name</span>
          <Input id="term-name" name="name" required placeholder="Term 1 2027" />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="term-start">
          <span className="text-sm font-medium text-foreground">Start</span>
          <Input id="term-start" name="startDate" type="date" required />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="term-end">
          <span className="text-sm font-medium text-foreground">End</span>
          <Input id="term-end" name="endDate" type="date" required />
        </label>
        <Button type="submit" loading={isBusy}>
          Add term
        </Button>
      </form>
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      {terms.length > 0 && (
        <ul className="flex max-w-md flex-col gap-2">
          {terms.map((term) => (
            <li
              key={term.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm"
            >
              <span className="font-medium text-foreground">{term.name}</span>
              <span className="text-muted-foreground num">
                {term.startDate} → {term.endDate}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
