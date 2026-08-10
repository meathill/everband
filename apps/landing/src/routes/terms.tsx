import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "~/components/site-footer.tsx";
import { SiteHeader } from "~/components/site-header.tsx";

// 服务条款英文初稿（issue #3）。只描述已实现能力（PRD §7.1 红线：不提器材/财务/
// 学生账号/公开活动）。法律审查（PRD §14）完成后修订。
export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Everband" },
      {
        name: "description",
        content: "The terms that govern your use of Everband.",
      },
    ],
  }),
  component: TermsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function TermsPage() {
  return (
    <div className="flex flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-16 [&_li]:text-muted-foreground [&_p]:text-muted-foreground">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="text-sm">Effective date: 10 August 2026</p>
        </div>

        <Section title="The service">
          <p>
            Everband is a tool for community bands, teams and clubs to manage members and
            families, publish events with updates and attachments, run rehearsal helper rosters,
            collect RSVPs and sign-ups, import members from CSV files, and send email updates. By
            creating an account or using Everband you agree to these terms.
          </p>
        </Section>

        <Section title="Accounts and responsibilities">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Accounts are held by adults. You must be 18 or older to hold an account.</li>
            <li>
              You are responsible for the accuracy of the information you add about your
              organization and its members, and for having the right to add it — including
              consent from the families whose details you enter.
            </li>
            <li>
              Sign-in is by one-time codes sent to your email. Keep access to your email account
              secure; anyone with access to your email can sign in as you.
            </li>
            <li>
              Organization owners control who has staff access. Review staff membership when
              people leave your organization.
            </li>
          </ul>
        </Section>

        <Section title="Acceptable use">
          <p>
            Use Everband only to run your own organization. Do not use it to send unsolicited
            email, to store or distribute unlawful content, to attempt to access other
            organizations' data, or to interfere with the operation of the service. We may
            suspend accounts that violate these rules.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            Your organization's data belongs to your organization. We only use it to operate the
            service, as described in our{" "}
            <a href="/privacy" className="text-primary underline-offset-4 hover:underline">
              Privacy Policy
            </a>
            . You are responsible for the content you upload, including attachments.
          </p>
        </Section>

        <Section title="Availability and disclaimer">
          <p>
            Everband is provided "as is" and "as available", without warranties of any kind. We
            work to keep the service reliable, but we do not guarantee uninterrupted availability
            or that emails will always be delivered — email delivery ultimately depends on
            recipients' mail providers.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, Everband is not liable for indirect,
            incidental or consequential damages arising from your use of the service. Nothing in
            these terms excludes rights that cannot be excluded under applicable law, including
            the Australian Consumer Law.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may stop using Everband at any time and ask us to delete your organization's data
            (see the Privacy Policy). We may suspend or terminate access for breach of these
            terms, with notice where practical.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these terms as the product evolves. We will update the effective date
            above, and material changes will be communicated to organization owners by email.
            Continued use after changes take effect constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms? Reach us through the{" "}
            <a href="/#contact" className="text-primary underline-offset-4 hover:underline">
              contact form
            </a>{" "}
            on our home page.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
