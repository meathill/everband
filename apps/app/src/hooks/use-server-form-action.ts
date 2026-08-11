import { toastManager } from "@everband/ui/components/toast";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";

/** 写操作 server fn 的统一返回约定：鉴权失败抛异常，业务失败返回 ok:false。 */
export type ServerActionResult = { ok: true } | { ok: false; error: string };

/** server fn 可能返回额外字段（如 { ok: true, groupId }），这里只约束判别字段。 */
export type ServerAction<TInput> = (payload: { data: TInput }) => Promise<ServerActionResult>;

export interface UseServerFormActionOptions<TInput> {
  action: ServerAction<TInput>;
  /** 有值则成功后弹 toast */
  successMessage?: string;
  onSuccess?: () => void;
}

export interface UseServerFormAction<TInput> {
  error: string | null;
  isBusy: boolean;
  /** 返回 true 表示成功 */
  submit: (data: TInput) => Promise<boolean>;
  reset: () => void;
}

const GENERIC_ERROR = "Something went wrong. Try again.";

/**
 * 把"提交 server fn → 失败显示错误 / 成功刷新数据 + toast"这套模板收敛成一处。
 * 表单本身保持非受控（FormData 读值），本 hook 只管提交与状态。
 */
export function useServerFormAction<TInput>({
  action,
  successMessage,
  onSuccess,
}: UseServerFormActionOptions<TInput>): UseServerFormAction<TInput> {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = useCallback(
    async (data: TInput): Promise<boolean> => {
      setError(null);
      setIsBusy(true);
      try {
        const result = await action({ data });
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        // 先刷新 loader 数据再关闭，避免关掉抽屉后列表还是旧的
        await router.invalidate();
        if (successMessage) {
          toastManager.add({ title: successMessage, type: "success" });
        }
        onSuccess?.();
        return true;
      } catch {
        // 鉴权/网络异常走这里。server 抛的是 "unauthenticated" 这类内部标识，不适合直接展示
        setError(GENERIC_ERROR);
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [action, onSuccess, router, successMessage],
  );

  const reset = useCallback(() => setError(null), []);

  return { error, isBusy, reset, submit };
}
