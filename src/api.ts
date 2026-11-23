import type {
  AdminDatabase,
  ExamResultRow,
  FinishExamResponse,
  FullBackupSnapshot,
  LiveProgress,
  LoginResponse,
  PublicConfigResponse,
  SheetSyncConfig,
  StartExamResponse,
} from './types';

let authToken = '';

export function setAuthToken(token: string): void {
  authToken = token;
}

export function clearAuthToken(): void {
  authToken = '';
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Permintaan gagal (${res.status})`) as Error & {
      back?: boolean;
      status?: number;
    };
    err.back = Boolean(data.back);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function getPublicConfig(): Promise<PublicConfigResponse> {
  return apiFetch<PublicConfigResponse>('/api/public');
}

export function bootstrapAdmin(password: string, nama?: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/api/admin/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ password, nama }),
  });
}

export function loginRequest(
  username: string,
  password: string,
  mapel?: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, mapel }),
  });
}

export function startExamRequest(token: string): Promise<StartExamResponse> {
  return apiFetch<StartExamResponse>('/api/exam/start', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function saveExamProgress(payload: {
  ans: number[];
  flg: boolean[];
  cur: number;
  left: number;
  st: 'Mengerjakan' | 'Selesai';
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/exam/save', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function finishExamRequest(ans: number[]): Promise<FinishExamResponse> {
  return apiFetch<FinishExamResponse>('/api/exam/finish', {
    method: 'POST',
    body: JSON.stringify({ ans }),
  });
}

export function getAdminData(): Promise<AdminDatabase> {
  return apiFetch<AdminDatabase>('/api/admin/data');
}

export function saveAdminData(db: AdminDatabase & { users: Array<Record<string, unknown>> }): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/admin/save', {
    method: 'POST',
    body: JSON.stringify(db),
  });
}

export function getAdminExtra(): Promise<{
  live: Record<string, LiveProgress>;
  hasil: ExamResultRow[];
  sheetSync?: SheetSyncConfig;
}> {
  return apiFetch('/api/admin/extra');
}

export function resetStudentExam(username: string, mapel: string, paket: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/admin/reset', {
    method: 'POST',
    body: JSON.stringify({ username, mapel, paket }),
  });
}

export function getAdminBackup(): Promise<FullBackupSnapshot> {
  return apiFetch<FullBackupSnapshot>('/api/admin/backup');
}

export function restoreAdminBackup(
  snapshot: FullBackupSnapshot,
): Promise<{ ok: boolean; data: AdminDatabase }> {
  return apiFetch<{ ok: boolean; data: AdminDatabase }>('/api/admin/restore', {
    method: 'POST',
    body: JSON.stringify(snapshot),
  });
}

export function saveSheetSyncConfig(
  payload: Partial<SheetSyncConfig>,
): Promise<{ ok: boolean; sheetSync: SheetSyncConfig }> {
  return apiFetch<{ ok: boolean; sheetSync: SheetSyncConfig }>('/api/admin/sheet-sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
