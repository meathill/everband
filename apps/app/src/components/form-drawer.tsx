import { Button } from "@everband/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "@everband/ui/components/drawer";
import type React from "react";
import { useRef, useState } from "react";

export interface FormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** 提交失败的错误文案，通常来自 useServerFormAction */
  error?: string | null;
  isBusy?: boolean;
  submitLabel: string;
  cancelLabel?: string;
  /** 表单已 preventDefault，这里拿到的是原始 FormData，由调用方组装成 server fn 入参 */
  onSubmit: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}

/**
 * "New XXX" 类表单的统一容器：右侧抽屉 + 可滚动表单主体 + 固定底部操作区。
 * 表单一律非受控（defaultValue + FormData 读值），关闭时 children 随 Portal 卸载天然重置。
 */
export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  error,
  isBusy = false,
  submitLabel,
  cancelLabel = "Cancel",
  onSubmit,
  children,
}: FormDrawerProps): React.ReactElement {
  // 关闭动画（450ms）跑完 Portal 才卸载 children。在这之前再次打开——比如"取消"后立刻
  // 点"New xxx"，或从一行的编辑切到另一行——子树没被卸载过，非受控输入与内部 state 会留着
  // 上一次的值。这里给每次「关 → 开」换一个 key，强制重挂，让"关闭即重置"始终成立。
  const [instance, setInstance] = useState(0);
  const wasOpen = useRef(open);
  if (wasOpen.current !== open) {
    wasOpen.current = open;
    if (open) {
      setInstance((value) => value + 1);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(new FormData(event.currentTarget));
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} position="right">
      {/* 小屏全宽，≥640px 收窄；默认 max-w-md 由 sm:max-w-lg 覆盖 */}
      <DrawerPopup className="w-full sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* popup 是 touch-none，滚动容器要显式 touch-auto 才能在触屏滚动 */}
          <div className="min-h-0 flex-1 touch-auto overflow-y-auto">
            <DrawerPanel key={instance} scrollable={false}>
              {children}
            </DrawerPanel>
          </div>

          {error && (
            <p className="px-6 pb-3 text-sm text-destructive-foreground" role="alert">
              {error}
            </p>
          )}

          <DrawerFooter>
            <DrawerClose disabled={isBusy} render={<Button variant="outline" />}>
              {cancelLabel}
            </DrawerClose>
            <Button type="submit" loading={isBusy}>
              {submitLabel}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerPopup>
    </Drawer>
  );
}
