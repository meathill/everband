import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

// M1 骨架：完整的六板块 Landing 内容在 M9 落地（PRD §7.1）。
function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-6 px-4">
      <p className="eyebrow text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        For community bands, teams and clubs
      </p>
      <h1 className="max-w-3xl text-center text-5xl font-semibold tracking-tight text-foreground">
        Run your community band without the spreadsheets
      </h1>
      <p className="max-w-2xl text-center text-lg text-muted-foreground">
        Members, events, rehearsals and parent rosters in one place — instead of spreadsheets,
        group emails and lost attachments.
      </p>
    </main>
  );
}
