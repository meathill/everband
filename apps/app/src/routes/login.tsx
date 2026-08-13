import { Button } from "@everband/ui/components/button";
import { Card, CardPanel } from "@everband/ui/components/card";
import { Field, FieldLabel } from "@everband/ui/components/field";
import { Form } from "@everband/ui/components/form";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FrameTitle,
} from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { OTPField, OTPFieldInput } from "@everband/ui/components/otp-field";
import { redirectPathSchema } from "@everband/validation";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { requestLoginCode, verifyLoginOtp } from "~/server/auth.ts";

const LANDING_URL = "https://everband.meathill.com";
const OTP_LENGTH = 6;
const OTP_SLOT_KEYS = Array.from({ length: OTP_LENGTH }, (_, index) => `otp-slot-${index}`);

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — Everband" }],
  }),
  // 非法 redirect 参数静默丢弃（防开放重定向），登录仍可完成
  validateSearch: z.object({ redirect: redirectPathSchema.optional().catch(undefined) }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await requestLoginCode({ data: { email, redirect: search.redirect } });
      if (result.ok) {
        setStep("otp");
      } else {
        setError(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await verifyLoginOtp({ data: { email, otp } });
      if (result.ok) {
        await navigate({ to: search.redirect ?? result.redirectTo });
      } else {
        setError(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  function handleUseDifferentEmail(): void {
    setStep("email");
    setOtp("");
    setError(null);
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4 py-8 sm:px-6">
      <Frame className="w-full">
        <FrameHeader className="gap-1.5 px-5 py-5 sm:px-6 sm:py-6">
          <FrameTitle className="text-xl leading-tight sm:text-2xl">Sign in</FrameTitle>
          <FrameDescription className="max-w-prose text-sm/6">
            {step === "email"
              ? "Enter your email and we'll send you a sign-in code."
              : `We sent a 6-digit code to ${email}. Enter it below, or use the link in the email.`}
          </FrameDescription>
        </FrameHeader>

        <Card className="border-border">
          <CardPanel className="flex flex-col gap-5 p-5 sm:p-6">
            {step === "email" ? (
              <Form onSubmit={handleRequestCode} className="flex flex-col gap-5">
                <Field>
                  <FieldLabel htmlFor="login-email">Email</FieldLabel>
                  <Input
                    autoFocus
                    id="login-email"
                    name="email"
                    placeholder="you@example.com"
                    required
                    size="lg"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Button className="w-full" loading={isBusy} size="lg" type="submit">
                  Send code
                </Button>
              </Form>
            ) : (
              <Form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
                <Field>
                  <FieldLabel>6-digit code</FieldLabel>
                  <OTPField
                    aria-label="6-digit sign-in code"
                    className="w-full justify-between gap-1.5 sm:gap-2"
                    inputMode="numeric"
                    length={OTP_LENGTH}
                    onValueChange={setOtp}
                    value={otp}
                  >
                    {OTP_SLOT_KEYS.map((slotKey, index) => (
                      <OTPFieldInput
                        key={slotKey}
                        aria-invalid={error ? true : undefined}
                        aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                        autoFocus={index === 0}
                        required
                      />
                    ))}
                  </OTPField>
                </Field>
                <Button className="w-full" loading={isBusy} size="lg" type="submit">
                  Sign in
                </Button>
                <Button
                  className="w-full"
                  onClick={handleUseDifferentEmail}
                  type="button"
                  variant="ghost"
                >
                  Use a different email
                </Button>
              </Form>
            )}

            {error ? (
              <p aria-live="polite" className="text-destructive-foreground text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </CardPanel>
        </Card>

        <FrameFooter className="px-5 py-4 sm:px-6">
          <p className="text-center text-muted-foreground text-xs/5">
            By signing in you agree to our{" "}
            <a
              href={`${LANDING_URL}/terms`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href={`${LANDING_URL}/privacy`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Privacy Policy
            </a>
            .
          </p>
        </FrameFooter>
      </Frame>
    </main>
  );
}
