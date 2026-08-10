import { Button } from "@everband/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

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
      <div className="flex gap-3">
        <Button render={<Link to="/new-org" />}>Get started</Button>
        <Button variant="outline" render={<Link to="/login" />}>
          Sign in
        </Button>
      </div>
    </main>
  );
}
