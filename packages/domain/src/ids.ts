// 实体 ID：前缀 + ULID（时间有序、可排序、URL 安全）。
// 前缀让 ID 在日志/审计里自解释，也防止跨对象误用。

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export const ID_PREFIXES = {
  user: "usr",
  session: "ses",
  authToken: "atk",
  organization: "org",
  membership: "mem",
  household: "hh",
  contact: "ct",
  student: "stu",
  group: "grp",
  term: "term",
  event: "evt",
  eventUpdate: "upd",
  attachment: "att",
  eventForm: "form",
  formSubmission: "sub",
  rehearsalSeries: "rs",
  rehearsalOccurrence: "ro",
  rosterAssignment: "ra",
  swapRequest: "swap",
  notification: "ntf",
  emailSend: "send",
  emailSendRecipient: "rcp",
  emailOpen: "ope",
  emailDraft: "dft",
  importJob: "imp",
  importJobRow: "row",
  auditEntry: "aud",
  qrCode: "qr",
  ledgerEntry: "led",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

function encodeTime(time: number): string {
  let value = time;
  let out = "";
  for (let i = 0; i < TIME_LEN; i++) {
    out = ULID_ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ULID_ALPHABET[byte % 32];
  }
  return out;
}

export function generateId(prefix: IdPrefix, now: number = Date.now()): string {
  return `${prefix}_${encodeTime(now)}${encodeRandom()}`;
}

export function hasPrefix(id: string, prefix: IdPrefix): boolean {
  return id.startsWith(`${prefix}_`);
}
