import { Button } from "@everband/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@everband/ui/components/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { toastManager } from "@everband/ui/components/toast";
import { PlusIcon, SignOutIcon } from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useState } from "react";
import { getGroupMembers, updateStudent } from "~/server/members.ts";

export interface GroupMembersDrawerProps {
  orgId: string;
  /** 打开时按 id 拉数据；不传或 id 变化会重新拉 */
  group: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type GroupMember = Awaited<ReturnType<typeof getGroupMembers>>["members"][number];

/**
 * 分组成员管理抽屉：查看成员、把无分组学生加入本组、把成员移出（回到无分组）。
 * 数据不进 URL，抽屉内部持有并操作后整体重拉，保持单一事实来源。
 */
export function GroupMembersDrawer({
  orgId,
  group,
  open,
  onOpenChange,
}: GroupMembersDrawerProps): React.ReactElement {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [unassigned, setUnassigned] = useState<GroupMember[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!open || !group) {
      return;
    }
    let cancelled = false;
    setSelectedId("");
    void getGroupMembers({ data: { orgId, groupId: group.id } }).then((result) => {
      if (cancelled) {
        return;
      }
      setMembers(result.members);
      setUnassigned(result.unassigned);
    });
    return () => {
      cancelled = true;
    };
  }, [group, open, orgId]);

  async function assign(studentId: string, groupId: string | null): Promise<void> {
    setIsBusy(true);
    const result = await updateStudent({ data: { orgId, studentId, groupId } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      setIsBusy(false);
      return;
    }
    const next = await getGroupMembers({ data: { orgId, groupId: group?.id ?? "" } });
    setMembers(next.members);
    setUnassigned(next.unassigned);
    setSelectedId("");
    setIsBusy(false);
    toastManager.add({ title: "Group updated", type: "success" });
  }

  const unassignedLabels: Record<string, string> = {};
  for (const student of unassigned) {
    unassignedLabels[student.id] = student.name;
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open} position="right">
      <DrawerPopup className="w-full sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{group?.name ?? "Group members"}</DrawerTitle>
          <DrawerDescription>
            Add unassigned students to this group, or move members out.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 touch-auto overflow-y-auto px-6">
            <div className="flex flex-col gap-2">
              <h2 className="font-semibold text-sm text-foreground">Members ({members.length})</h2>
              {members.length === 0 ? (
                <p className="text-muted-foreground text-sm">No members yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {members.map((student) => (
                    <li
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
                      key={student.id}
                    >
                      <span className="font-medium text-foreground">{student.name}</span>
                      <Button
                        aria-label={`Move ${student.name} out`}
                        disabled={isBusy}
                        onClick={() => void assign(student.id, null)}
                        size="xs"
                        variant="outline"
                      >
                        <SignOutIcon />
                        Move out
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <h2 className="font-semibold text-sm text-foreground">Add member</h2>
              {unassigned.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Every student belongs to a group already.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    items={unassignedLabels}
                    onValueChange={(value: string | null) => value && setSelectedId(value)}
                    value={selectedId}
                  >
                    <SelectTrigger aria-label="Unassigned student" className="w-auto min-w-48">
                      <SelectValue placeholder="Choose a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {unassigned.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!selectedId || isBusy}
                    onClick={() => selectedId && void assign(selectedId, group?.id ?? null)}
                  >
                    <PlusIcon />
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DrawerFooter>
            <DrawerClose render={<Button variant="outline" />}>Done</DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerPopup>
    </Drawer>
  );
}
