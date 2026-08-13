import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "~/components/site-footer.tsx";
import { SiteHeader } from "~/components/site-header.tsx";

// 隐私政策英文初稿（issue #3）。事实来源：PRD §8.4 + 首页 Privacy & safety 四条承诺 +
// 已实现的退订机制。红线：不承诺澳洲数据驻留；未实现的能力（自助导出/删除）如实写 contact us。
// 法律审查（PRD §14）完成后修订。
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Everband" },
      {
        name: "description",
        content:
          "How Everband collects, uses and protects information for community bands, teams and clubs.",
      },
      { property: "og:title", content: "Privacy Policy — Everband" },
      {
        property: "og:description",
        content:
          "How Everband collects, uses and protects information for community bands, teams and clubs.",
      },
      { property: "og:url", content: "https://everband.meathill.com/privacy" },
      { name: "twitter:title", content: "Privacy Policy — Everband" },
      {
        name: "twitter:description",
        content:
          "How Everband collects, uses and protects information for community bands, teams and clubs.",
      },
    ],
    links: [{ rel: "canonical", href: "https://everband.meathill.com/privacy" }],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function PrivacyPage() {
  return (
    <div className="flex flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-16 [&_li]:text-muted-foreground [&_p]:text-muted-foreground">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="text-sm">Effective date: 10 August 2026</p>
        </div>

        <Section title="Who we are">
          <p>
            Everband helps community bands, teams and clubs manage members, events, rehearsals and
            parent rosters. This policy explains what information we collect, how we use it, and the
            choices you have. It applies to the Everband website and application.
          </p>
        </Section>

        <Section title="Information we collect">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-foreground">Account information.</strong> Adults hold the
              accounts. We collect your email address to sign you in and to send you the emails your
              organization asks us to send.
            </li>
            <li>
              <strong className="text-foreground">Organization records.</strong> Staff members add
              or import records about their organization: member and family names, contact emails,
              group assignments, events, rehearsal rosters and attachments.
            </li>
            <li>
              <strong className="text-foreground">Student information.</strong> Students never sign
              in and never hold accounts. We collect the minimum needed to run the organization —
              typically a name and group membership. We do not collect student credentials or
              medical information.
            </li>
            <li>
              <strong className="text-foreground">Technical information.</strong> We keep limited
              operational logs (such as the IP address of sign-in requests) to protect accounts
              against abuse. We do not write message contents or other sensitive details into logs.
            </li>
          </ul>
        </Section>

        <Section title="How we use information">
          <p>
            We use information only to provide the service: signing you in, showing your
            organization its own records, sending the emails your organization's staff compose
            (event updates, invitations, rosters), and keeping an audit history of staff actions. We
            do not sell personal information or use it for advertising.
          </p>
        </Section>

        <Section title="Data isolation">
          <p>
            Each organization's data is isolated. Staff and parents only see their own organization.
            Every request is checked on the server against your membership and role before any data
            is returned.
          </p>
        </Section>

        <Section title="Attachments and files">
          <p>
            Attachments are private. Files are stored in private storage and are never exposed
            through long-lived public links. Every download is checked against who is allowed to see
            it. Contact details are never public, and there are no public event pages.
          </p>
        </Section>

        <Section title="Sign-in security">
          <p>
            We use passwordless sign-in: a one-time code and magic link sent to your email. Codes
            and links expire after 10 minutes, can only be used once, and requests are rate-limited.
          </p>
        </Section>

        <Section title="Email and unsubscribe">
          <p>
            Organizations send operational emails through Everband, such as event updates and roster
            reminders. You can unsubscribe from these at any time using the link in each email.
            Sign-in and security emails are not affected by unsubscribing, because they are required
            to access your account. We record who each email was sent to and whether it was
            delivered, so staff can see delivery status; we do not log the full content of messages
            alongside recipient details.
          </p>
        </Section>

        <Section title="Where data is stored">
          <p>
            Everband runs on Cloudflare's global network, and data is stored with Cloudflare's
            storage services. We do not currently guarantee that data is stored in any specific
            country or region, including Australia.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Everband is designed so that children do not use it directly. Students never sign in,
            hold no accounts, and cannot be contacted through the platform. Information about
            students is added and controlled by the adults who run the organization, and we keep it
            to the minimum needed.
          </p>
        </Section>

        <Section title="Data retention, deletion and export">
          <p>
            Organization data is retained while the organization remains active. Self-serve export
            and deletion are not yet available; if you want your personal information or your
            organization's data corrected, exported or deleted, contact us using the form on our
            home page and we will action it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy as the product and applicable law evolve. We will update the
            effective date above, and material changes will be communicated to organization owners
            by email.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about privacy? Reach us through the{" "}
            <a href="/contact" className="text-primary underline-offset-4 hover:underline">
              contact form
            </a>
            .
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
