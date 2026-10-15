export type ApiError = {error: string; code?: string};
export type CallRecord = {id: string; state: string; recipient?: string; startedAt?: string; endedAt?: string};
export type Template = {name: string; language?: string; status?: string};
