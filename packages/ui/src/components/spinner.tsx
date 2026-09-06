import { cn } from "@everband/ui/lib/utils";
// 本地修改（vendored 组件）：上游用 lucide-react，本项目设计红线只允许 @phosphor-icons/react。
import { CircleNotchIcon } from "@phosphor-icons/react";
import type React from "react";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof CircleNotchIcon>): React.ReactElement {
  return (
    <CircleNotchIcon
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
