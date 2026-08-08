import { Button } from "@everband/ui/components/button";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getMyEmailPreference, setEmailPreference } from "~/server/notify.ts";
import { getOrgContext } from "~/server/org.ts";

export const Route = createFileRoute("/o/$orgId/account")({
  loader: async ({ params }) => {
    try {
      const [ctx, preference] = await Promise.all([
        getOrgContext({ data: { orgId: params.orgId } }),
        getMyEmailPreference({ data: { orgId: params.orgId } }),
      ]);
      return { email: ctx.email, optOut: preference.optOut };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: AccountPage,
});

function AccountPage() {
  const { email, optOut } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function handleToggle() {
    setIsBusy(true);
    try {
      await setEmailPreference({ data: { orgId, optOut: !optOut } });
      await router.invalidate();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Account</h1>
      <dl className="text-sm">
        <dt className="text-muted-foreground">Signed in as</dt>
        <dd className="font-medium text-foreground">{email}</dd>
      </dl>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="font-medium text-foreground">Email preferences</h2>
        <p className="text-sm text-muted-foreground">
          Operational emails cover event updates and roster changes. Sign-in and security emails are
          always sent.
        </p>
        <p className="text-sm text-foreground">
          Operational emails: <strong>{optOut ? "off" : "on"}</strong>
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={handleToggle} loading={isBusy}>
            {optOut ? "Turn on" : "Turn off"}
          </Button>
        </div>
      </section>

      <Link to="/select-org" className="text-sm text-primary underline-offset-4 hover:underline">
        Switch organization
      </Link>
    </div>
  );
}
