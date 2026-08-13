import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "~/components/site-footer.tsx";
import { SiteHeader } from "~/components/site-header.tsx";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Everband" },
      {
        name: "description",
        content:
          "Everband is a management workspace for community bands, teams and clubs run by volunteers — members, events, rehearsals and rosters in one place.",
      },
      { property: "og:title", content: "About — Everband" },
      {
        property: "og:description",
        content:
          "Everband is a management workspace for community bands, teams and clubs run by volunteers — members, events, rehearsals and rosters in one place.",
      },
      { property: "og:url", content: "https://everband.meathill.com/about" },
      { name: "twitter:title", content: "About — Everband" },
      {
        name: "twitter:description",
        content:
          "Everband is a management workspace for community bands, teams and clubs run by volunteers — members, events, rehearsals and rosters in one place.",
      },
    ],
    links: [{ rel: "canonical", href: "https://everband.meathill.com/about" }],
  }),
  component: AboutPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">About Everband</h1>
          <p className="text-lg text-muted-foreground">
            One clear, traceable workspace for the people who keep community groups running.
          </p>
        </header>

        <Section title="What it is">
          <p className="text-muted-foreground">
            Everband brings together the work that usually lives in spreadsheets, group emails and
            scattered messages: members and families, events and updates, rehearsals and helper
            rosters, and the notifications that keep everyone posted.
          </p>
        </Section>

        <Section title="Who it's for">
          <p className="text-muted-foreground">
            Everband is built for community bands, teams and clubs run by volunteers — parents and
            committees who manage students, game days, concerts and working bees in their spare
            time.
          </p>
        </Section>

        <Section title="How we work">
          <ul className="flex flex-col gap-2 text-muted-foreground">
            <li>
              <strong className="text-foreground">Reliable and calm.</strong> The interface reads
              like a mature operations tool, not a dashboard demo.
            </li>
            <li>
              <strong className="text-foreground">Clear roles.</strong> Staff and parents only see
              what matters to them.
            </li>
            <li>
              <strong className="text-foreground">Honest status.</strong> Drafts, published,
              cancelled and failed states are never mixed up.
            </li>
          </ul>
        </Section>

        <Section title="Get in touch">
          <p className="text-muted-foreground">
            We read every message.{" "}
            <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
              Contact us
            </Link>{" "}
            with questions, feedback or ideas.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
