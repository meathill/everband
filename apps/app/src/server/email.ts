import { chooseEmailSender } from "@everband/core";
import type { Database } from "@everband/db";
import type { EmailSender } from "@everband/integrations/email";
import { getEmailMode } from "./context.ts";

// 事务邮件（magic link/邀请）直发；运营邮件走 email_sends 队列（M7）。
export function getEmailSender(db: Database): EmailSender {
  return chooseEmailSender(db, getEmailMode());
}
