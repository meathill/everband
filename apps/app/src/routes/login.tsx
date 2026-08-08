import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { requestLoginCode, verifyLoginOtp } from "~/server/auth.ts";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleRequestCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await requestLoginCode({ data: { email } });
      if (result.ok) {
        setStep("otp");
      } else {
        setError(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await verifyLoginOtp({ data: { email, otp } });
      if (result.ok) {
        await navigate({ to: result.redirectTo });
      } else {
        setError(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sign in</h1>
        <p className="text-muted-foreground">
          {step === "email"
            ? "Enter your email and we'll send you a sign-in code."
            : `We sent a 6-digit code to ${email}. Enter it below, or use the link in the email.`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleRequestCode} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5" htmlFor="login-email">
            <span className="text-sm font-medium text-foreground">Email</span>
            <Input
              id="login-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <Button type="submit" loading={isBusy}>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5" htmlFor="login-otp">
            <span className="text-sm font-medium text-foreground">6-digit code</span>
            <Input
              id="login-otp"
              inputMode="numeric"
              pattern="\d{6}"
              required
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="000000"
              className="font-mono tracking-widest"
            />
          </label>
          <Button type="submit" loading={isBusy}>
            Sign in
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep("email")}>
            Use a different email
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
    </main>
  );
}
