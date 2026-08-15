import { Button } from "@everband/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@everband/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Input } from "@everband/ui/components/input";
import { Textarea } from "@everband/ui/components/textarea";
import type React from "react";
import { useState } from "react";

// 反馈提交到 app-feedback（feedback.meathill.com）的公开 API。
// appId 标识来源；version 是构建注入的 git 短 hash，便于定位问题版本。
const FEEDBACK_API_URL = "https://feedback.meathill.com/api/feedbacks";
const FEEDBACK_APP_ID = "everband-app";

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 预填联系邮箱（登录用户） */
  email?: string;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  email,
}: FeedbackDialogProps): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("busy");
    const form = new FormData(event.currentTarget);
    const content = String(form.get("content"));
    const contact = String(form.get("contact"));
    try {
      const response = await fetch(FEEDBACK_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: FEEDBACK_APP_ID,
          version: __APP_VERSION__,
          content,
          contact: contact || undefined,
        }),
      });
      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  function close() {
    setStatus("idle");
    onOpenChange(false);
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Report a bug or share an idea. We read every message.
          </DialogDescription>
        </DialogHeader>

        {status === "sent" ? (
          <div className="flex flex-col gap-4 px-6 py-4">
            <p className="text-foreground text-sm">Thanks — we've received your feedback.</p>
            <DialogFooter className="px-0 pb-0">
              <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
              <Field>
                <FieldLabel htmlFor="feedback-content">What's on your mind?</FieldLabel>
                <Textarea
                  autoFocus
                  id="feedback-content"
                  name="content"
                  placeholder="Describe the issue or idea…"
                  required
                  rows={5}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feedback-contact">Email (optional)</FieldLabel>
                <Input
                  defaultValue={email}
                  id="feedback-contact"
                  name="contact"
                  placeholder="you@example.com"
                  type="email"
                />
                <FieldDescription>
                  Only used if we need to follow up. Version {__APP_VERSION__} is attached
                  automatically.
                </FieldDescription>
              </Field>
              {status === "error" && (
                <p className="text-destructive-foreground text-sm" role="alert">
                  Something went wrong — please try again in a moment.
                </p>
              )}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button loading={status === "busy"} type="submit">
                Send feedback
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}
