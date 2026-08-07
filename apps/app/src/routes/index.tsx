import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-5xl font-semibold tracking-tight text-foreground">Everband</h1>
      <p className="text-lg text-muted-foreground">
        Run your community band without the spreadsheets.
      </p>
    </main>
  );
}
