import { z } from "zod";

// 固定场景表单（PRD §5.3）：四种 kind 的配置与提交 payload。

export const FORM_KINDS = ["rsvp", "volunteer", "choice", "text"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export const createEventFormSchema = z
  .object({
    orgId: z.string().min(1),
    eventId: z.string().min(1),
    kind: z.enum(FORM_KINDS),
    // choice 场景的选项
    options: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .refine((value) => value.kind !== "choice" || (value.options?.length ?? 0) >= 2, {
    message: "Choice forms need at least two options",
    path: ["options"],
  });

const rsvpPayload = z.object({
  kind: z.literal("rsvp"),
  response: z.enum(["yes", "no", "maybe"]),
  note: z.string().trim().max(500).optional(),
});

const volunteerPayload = z.object({
  kind: z.literal("volunteer"),
  canHelp: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

const choicePayload = z.object({
  kind: z.literal("choice"),
  choice: z.string().trim().min(1).max(100),
});

const textPayload = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(2000),
});

export const formPayloadSchema = z.discriminatedUnion("kind", [
  rsvpPayload,
  volunteerPayload,
  choicePayload,
  textPayload,
]);

export type FormPayload = z.infer<typeof formPayloadSchema>;

export const submitFormSchema = z.object({
  orgId: z.string().min(1),
  formId: z.string().min(1),
  payload: formPayloadSchema,
});

export const formIdSchema = z.object({
  orgId: z.string().min(1),
  formId: z.string().min(1),
});

// choice 提交必须命中配置选项
export function validatePayloadAgainstConfig(
  payload: FormPayload,
  kind: FormKind,
  options: string[] | null,
): { valid: boolean; reason?: string } {
  if (payload.kind !== kind) {
    return { valid: false, reason: "Submission does not match the form type" };
  }
  if (payload.kind === "choice") {
    if (!options?.includes(payload.choice)) {
      return { valid: false, reason: "Pick one of the listed options" };
    }
  }
  return { valid: true };
}
