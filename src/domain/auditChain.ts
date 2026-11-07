import crypto from 'node:crypto';
import type { AuditLogRecord, Role } from './types';

export interface AuditHashInput {
  prevHash: string;
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  detailJson: string;
  createdAt: string;
}

export function computeAuditEntryHash(input: AuditHashInput): string {
  const canonical = [
    input.prevHash,
    input.actorId,
    input.actorRole,
    input.action,
    input.entityType,
    input.entityId,
    input.detailJson,
    input.createdAt,
  ].join('|');

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function verifyAuditChain(entries: AuditLogRecord[]): {
  valid: boolean;
  checkedCount: number;
  brokenAtSeq?: number;
} {
  let expectedPrev = 'GENESIS';

  for (const entry of entries) {
    if (entry.prevHash !== expectedPrev) {
      return {
        valid: false,
        checkedCount: entries.length,
        brokenAtSeq: entry.seq,
      };
    }

    const recomputed = computeAuditEntryHash({
      prevHash: entry.prevHash,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      detailJson: entry.detailJson,
      createdAt: entry.createdAt,
    });

    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        checkedCount: entries.length,
        brokenAtSeq: entry.seq,
      };
    }

    expectedPrev = entry.entryHash;
  }

  return { valid: true, checkedCount: entries.length };
}
