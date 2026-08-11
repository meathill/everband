import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@everband/ui/components/alert-dialog";
import { Button } from "@everband/ui/components/button";
import type React from "react";
import { useState } from "react";

export interface ConfirmDialogProps {
  /** 触发元素，会被 AlertDialogTrigger 接管（用 render，不额外包一层） */
  trigger: React.ReactElement;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 确认按钮用 destructive 变体 */
  destructive?: boolean;
  /** 返回 false 或抛错则不关闭，错误展示在对话框内 */
  onConfirm: () => boolean | void | Promise<boolean> | Promise<void>;
}

const GENERIC_ERROR = "Something went wrong. Try again.";

/** 二次确认对话框：自己管 open/loading/error，成功后自动关闭。 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      setError(null);
    }
  }

  async function handleConfirm() {
    setError(null);
    setIsBusy(true);
    try {
      const result = await onConfirm();
      if (result === false) {
        return;
      }
      setIsOpen(false);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          {error && (
            <p className="text-sm text-destructive-foreground" role="alert">
              {error}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose disabled={isBusy} render={<Button variant="outline" />}>
            {cancelLabel}
          </AlertDialogClose>
          <Button
            loading={isBusy}
            onClick={handleConfirm}
            variant={destructive ? "destructive" : "default"}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
