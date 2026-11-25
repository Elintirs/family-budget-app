/** Ключи кэша React Query: общие для всех хуков. */
export const keys = {
  analytics: ['analytics'] as const,
  table: ['table'] as const,
  edits: ['edits'] as const,
  bootstrap: ['bootstrap'] as const,
  operations: ['operations'] as const,
  lastSync: ['lastSync'] as const,
  /** Ключ мутации отправки: по нему видно, что отправка идёт (useSending, проверка версии). */
  sync: ['sync'] as const,
};
