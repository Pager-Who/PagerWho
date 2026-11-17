// In-memory stand-in for prisma.copilotProposal, covering only the queries copilot-proposals.ts uses.
type Row = { id: string; actorUserId: string; proposal: unknown; fingerprint: string; expiresAt: Date };
type Where = { id?: string; actorUserId?: string; expiresAt?: { gt?: Date; lte?: Date } };

export function fakeCopilotProposalStore() {
  const rows = new Map<string, Row>();
  const matches = (row: Row, where: Where = {}) => (where.id === undefined || row.id === where.id)
    && (where.actorUserId === undefined || row.actorUserId === where.actorUserId)
    && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt)
    && (!where.expiresAt?.lte || row.expiresAt <= where.expiresAt.lte);
  return {
    // JSON round-trip mimics JSONB storage.
    create: async ({ data }: { data: Row }) => { rows.set(data.id, { ...data, proposal: JSON.parse(JSON.stringify(data.proposal)) }); return data; },
    count: async ({ where }: { where?: Where } = {}) => [...rows.values()].filter((row) => matches(row, where)).length,
    findFirst: async ({ where }: { where?: Where } = {}) => [...rows.values()].find((row) => matches(row, where)) ?? null,
    deleteMany: async ({ where }: { where?: Where } = {}) => {
      const matched = [...rows.values()].filter((row) => matches(row, where));
      for (const row of matched) rows.delete(row.id);
      return { count: matched.length };
    },
  };
}
