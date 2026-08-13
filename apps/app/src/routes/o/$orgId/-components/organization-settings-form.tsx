import { Button } from "@everband/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { COMMON_TIMEZONES } from "@everband/validation";
import type React from "react";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { updateOrganization } from "~/server/org.ts";

export interface OrganizationSettingsFormProps {
  org: { id: string; name: string; timezone: string; contactEmail: string | null };
  isOwner: boolean;
}

/** 组织名称和时区是 owner 专属设置；staff 仍能看到当前值，避免设置页信息缺口。 */
export function OrganizationSettingsForm({
  org,
  isOwner,
}: OrganizationSettingsFormProps): React.ReactElement {
  const save = useServerFormAction({
    action: updateOrganization,
    successMessage: "Organization settings saved",
  });
  const timezoneOptions = COMMON_TIMEZONES.includes(
    org.timezone as (typeof COMMON_TIMEZONES)[number],
  )
    ? COMMON_TIMEZONES
    : [org.timezone, ...COMMON_TIMEZONES];
  const timezoneLabels = Object.fromEntries(timezoneOptions.map((value) => [value, value]));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await save.submit({
      orgId: org.id,
      name: String(formData.get("name") ?? "").trim(),
      timezone: String(formData.get("timezone") ?? org.timezone),
      contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    });
  }

  return (
    <section className="flex max-w-2xl flex-col gap-3">
      <h2 className="font-semibold text-foreground text-xl">Organization</h2>
      <form onSubmit={handleSubmit}>
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Identity</FrameTitle>
              <FrameDescription>
                The name appears throughout the staff and parent app.
              </FrameDescription>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="organization-name">Name</FieldLabel>
              <Input
                defaultValue={org.name}
                disabled={!isOwner}
                id="organization-name"
                name="name"
                required
              />
            </Field>
          </FramePanel>

          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Local time</FrameTitle>
              <FrameDescription>
                Existing times stay stored in UTC and are displayed using this timezone.
              </FrameDescription>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="organization-timezone">Timezone</FieldLabel>
              {isOwner ? (
                <Select defaultValue={org.timezone} items={timezoneLabels} name="timezone">
                  <SelectTrigger id="organization-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((timezone) => (
                      <SelectItem key={timezone} value={timezone}>
                        {timezone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input disabled id="organization-timezone" value={org.timezone} />
              )}
              <FieldDescription>Dates and rehearsal schedules use this setting.</FieldDescription>
            </Field>
          </FramePanel>

          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Public contact</FrameTitle>
              <FrameDescription>
                This email appears on public equipment cards so a finder can contact the
                organization.
              </FrameDescription>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="organization-contact-email">Contact email</FieldLabel>
              <Input
                defaultValue={org.contactEmail ?? ""}
                disabled={!isOwner}
                id="organization-contact-email"
                name="contactEmail"
                placeholder="committee@example.org"
                type="email"
              />
              <FieldDescription>
                Required before Staff can generate an equipment QR code.
              </FieldDescription>
            </Field>
          </FramePanel>
        </Frame>

        {isOwner ? (
          <div className="mt-3 flex items-center gap-3">
            <Button loading={save.isBusy} type="submit">
              Save organization
            </Button>
            {save.error && (
              <p className="text-destructive-foreground text-sm" role="alert">
                {save.error}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-muted-foreground text-sm">
            Only an owner can change these settings.
          </p>
        )}
      </form>
    </section>
  );
}
