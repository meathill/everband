import type { AssetRow } from "@everband/core";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { Textarea } from "@everband/ui/components/textarea";
import { toastManager } from "@everband/ui/components/toast";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { createAsset, updateAsset } from "~/server/assets.ts";

export interface AssetHolderOption {
  id: string;
  name: string;
}

export interface AssetFormDrawerProps {
  asset?: AssetRow;
  holderOptions: AssetHolderOption[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  orgId: string;
}

export function AssetFormDrawer({
  asset,
  holderOptions,
  onOpenChange,
  open,
  orgId,
}: AssetFormDrawerProps): React.ReactElement {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isEdit = Boolean(asset);
  const hasUnavailableCurrentHolder = Boolean(
    asset?.currentHolderStudentId &&
      !holderOptions.some((option) => option.id === asset.currentHolderStudentId),
  );

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsBusy(true);
    const holderValue = String(formData.get("currentHolderStudentId") ?? "unassigned");
    const input = {
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? ""),
      serialNumber: String(formData.get("serialNumber") ?? ""),
      currentHolderStudentId: holderValue === "unassigned" ? null : holderValue,
      notes: String(formData.get("notes") ?? ""),
    };
    try {
      if (asset) {
        const result = await updateAsset({ data: { orgId, assetId: asset.id, ...input } });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toastManager.add({ title: "Equipment updated", type: "success" });
      } else {
        const result = await createAsset({ data: { orgId, ...input } });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.qrGenerated) {
          toastManager.add({ title: "Equipment and QR code created", type: "success" });
        } else {
          toastManager.add({
            title: "Equipment saved; QR not generated",
            description: result.qrError,
            type: "warning",
          });
        }
      }
      await router.invalidate();
      onOpenChange(false);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <FormDrawer
      description="Public labels show identification details only. Notes stay private to Staff."
      error={error}
      isBusy={isBusy}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setError(null);
        onOpenChange(nextOpen);
      }}
      onSubmit={handleSubmit}
      open={open}
      submitLabel={isEdit ? "Save changes" : "Add equipment"}
      title={isEdit ? "Edit equipment" : "New equipment"}
    >
      <Frame>
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Identification</FrameTitle>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="asset-name">Name</FieldLabel>
            <Input
              defaultValue={asset?.name}
              id="asset-name"
              name="name"
              placeholder="Alto saxophone"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-type">Category</FieldLabel>
              <Input
                defaultValue={asset?.type}
                id="asset-type"
                name="type"
                placeholder="Instrument"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="asset-serial">Number</FieldLabel>
              <Input
                defaultValue={asset?.serialNumber ?? ""}
                id="asset-serial"
                name="serialNumber"
                placeholder="AS-014"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="asset-holder">Current holder</FieldLabel>
            <Select
              defaultValue={asset?.currentHolderStudentId ?? "unassigned"}
              name="currentHolderStudentId"
            >
              <SelectTrigger id="asset-holder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Not assigned</SelectItem>
                {hasUnavailableCurrentHolder && asset?.currentHolderStudentId && (
                  <SelectItem disabled value={asset.currentHolderStudentId}>
                    {asset.currentHolderName ?? "Unavailable student"} (inactive)
                  </SelectItem>
                )}
                {holderOptions.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Only active students can be assigned. The public card abbreviates their name.
            </FieldDescription>
          </Field>
        </FramePanel>
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Staff notes</FrameTitle>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="asset-notes">Notes</FieldLabel>
            <Textarea
              defaultValue={asset?.notes ?? ""}
              id="asset-notes"
              name="notes"
              placeholder="Condition, storage location or other internal context"
            />
            <FieldDescription>Never shown on the public QR page.</FieldDescription>
          </Field>
        </FramePanel>
      </Frame>
    </FormDrawer>
  );
}
