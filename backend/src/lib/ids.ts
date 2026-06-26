import { ulid } from 'ulid';

/** Generate a new sortable ULID (used for all primary keys). */
export function newId(): string {
  return ulid();
}

/** Prefixed id for human-readable receipts etc. */
export function newReceipt(prefix = 'rcpt'): string {
  return `${prefix}_${ulid()}`;
}
