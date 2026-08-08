// 活动与更新状态机（PRD §5.2）。

export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export type EventUpdateStatus = "draft" | "published";

const EVENT_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["published"],
  published: ["cancelled", "completed"],
  // 取消/完成保留历史记录，不再流转
  cancelled: [],
  completed: [],
};

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return EVENT_TRANSITIONS[from].includes(to);
}

export function canTransitionEventUpdate(from: EventUpdateStatus, to: EventUpdateStatus): boolean {
  return from === "draft" && to === "published";
}

// parent 可见状态：published 显示日程，cancelled 保留但标注取消（PRD §5.2）
export function isParentVisibleEventStatus(status: EventStatus): boolean {
  return status !== "draft";
}
