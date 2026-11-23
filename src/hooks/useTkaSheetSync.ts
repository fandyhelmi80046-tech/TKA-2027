import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { getAdminBackup, saveSheetSyncConfig } from '../api';
import type { DriveFileMeta, FullBackupSnapshot, SheetSyncConfig } from '../types';
import {
  findTka2027Spreadsheet,
  readTka2027Spreadsheet,
  TKA_SPREADSHEET_TITLE,
  writeTka2027Spreadsheet,
} from '../utils/googleSheets';
import {
  getGoogleWorkspaceToken,
  initGoogleWorkspaceAuth,
  signInGoogleWorkspace,
  signOutGoogleWorkspace,
} from '../utils/googleWorkspace';

export interface PendingSheetRestore {
  snapshot: FullBackupSnapshot;
  fileMeta: DriveFileMeta;
}

export interface TkaSheetSyncState {
  googleUser: User | null;
  needsAuth: boolean;
  signingIn: boolean;
  checking: boolean;
  syncing: boolean;
  sheetFile: DriveFileMeta | null;
  setSheetFile: (file: DriveFileMeta | null) => void;
  autoSyncEnabled: boolean;
  autoSyncPromptOpen: boolean;
  pendingSheetRestore: PendingSheetRestore | null;
  dismissPendingSheetRestore: () => void;
  markSheetConnectedMeta: (fileMeta: DriveFileMeta, autoSync?: boolean) => Promise<void>;
  syncMessage: string;
  syncError: string;
  driveDirty: boolean;
  setDriveDirty: (dirty: boolean) => void;
  checkSheetFile: () => Promise<DriveFileMeta | null>;
  signIn: (promptAutoSyncAfter?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  requestEnableAutoSync: () => Promise<void>;
  confirmEnableAutoSync: () => Promise<void>;
  dismissAutoSyncPrompt: () => void;
  disableAutoSync: () => Promise<void>;
  syncNowToSheet: (
    overrideSheetId?: string,
    options?: { forceOverwrite?: boolean },
  ) => Promise<DriveFileMeta | null>;
  notifyDataSaved: () => Promise<boolean>;
  applyRestoredSyncState: (next?: SheetSyncConfig) => void;
  clearMessages: () => void;
}

function buildStubMeta(cfg?: SheetSyncConfig): DriveFileMeta | null {
  if (!cfg?.sheetId) return null;
  return {
    id: cfg.sheetId,
    name: cfg.sheetName || TKA_SPREADSHEET_TITLE,
    modifiedTime: cfg.lastSyncedAt ? new Date(cfg.lastSyncedAt).toISOString() : undefined,
    webViewLink: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(cfg.sheetId)}/edit`,
  };
}

function isSnapshotEffectivelyEmpty(s: FullBackupSnapshot): boolean {
  return (
    s.soal.length === 0 &&
    s.ujian.length === 0 &&
    s.sesi.length === 0 &&
    (s.hasil?.length || 0) === 0 &&
    s.users.filter((u) => u.role !== 'admin').length === 0
  );
}

export function useTkaSheetSync(initialConfig?: SheetSyncConfig): TkaSheetSyncState {
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(() => !getGoogleWorkspaceToken());
  const [signingIn, setSigningIn] = useState(false);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sheetFile, setSheetFileState] = useState<DriveFileMeta | null>(() =>
    buildStubMeta(initialConfig),
  );
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => Boolean(initialConfig?.autoSync));
  const [autoSyncPromptOpen, setAutoSyncPromptOpen] = useState(false);
  const [pendingSheetRestore, setPendingSheetRestore] = useState<PendingSheetRestore | null>(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const [driveDirty, setDriveDirtyState] = useState(() => Boolean(initialConfig?.dirty));

  const sheetFileRef = useRef<DriveFileMeta | null>(buildStubMeta(initialConfig));
  const autoSyncEnabledRef = useRef(Boolean(initialConfig?.autoSync));
  const driveDirtyRef = useRef(Boolean(initialConfig?.dirty));
  const isSyncRunningRef = useRef(false);
  const needsAnotherSyncRef = useRef(false);
  const dismissedPromptRef = useRef(false);
  const dismissedRestorePromptRef = useRef(false);

  const setSheetFile = useCallback((file: DriveFileMeta | null) => {
    sheetFileRef.current = file;
    setSheetFileState(file);
  }, []);

  const setDriveDirty = useCallback((dirty: boolean) => {
    driveDirtyRef.current = dirty;
    setDriveDirtyState(dirty);
  }, []);

  const clearMessages = useCallback(() => {
    setSyncMessage('');
    setSyncError('');
  }, []);

  const dismissPendingSheetRestore = useCallback(() => {
    dismissedRestorePromptRef.current = true;
    setPendingSheetRestore(null);
  }, []);

  const markSheetConnectedMeta = useCallback(
    async (fileMeta: DriveFileMeta, nextAutoSync?: boolean) => {
      setSheetFile(fileMeta);
      setDriveDirty(false);
      dismissedRestorePromptRef.current = false;
      setPendingSheetRestore(null);
      try {
        await saveSheetSyncConfig({
          ...(typeof nextAutoSync === 'boolean' ? { autoSync: nextAutoSync } : {}),
          dirty: false,
          sheetId: fileMeta.id,
          sheetName: fileMeta.name,
          lastSyncedAt: Date.now(),
        });
      } catch {
        // ignore transient save error
      }
    },
    [setDriveDirty, setSheetFile],
  );

  const inspectForDeployRestore = useCallback(
    async (fileMeta: DriveFileMeta): Promise<boolean> => {
      if (dismissedRestorePromptRef.current) return false;
      try {
        const local = await getAdminBackup();
        if (!isSnapshotEffectivelyEmpty(local)) return false;
        const remote = await readTka2027Spreadsheet(fileMeta.id);
        if (!isSnapshotEffectivelyEmpty(remote)) {
          setPendingSheetRestore({ snapshot: remote, fileMeta });
          return true;
        }
      } catch {
        // ignore inspect error
      }
      return false;
    },
    [],
  );

  const checkSheetFile = useCallback(async (): Promise<DriveFileMeta | null> => {
    if (!getGoogleWorkspaceToken()) return null;
    setChecking(true);
    setSyncError('');
    try {
      const found = await findTka2027Spreadsheet();
      setSheetFile(found);
      if (found) {
        await inspectForDeployRestore(found);
      }
      return found;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memeriksa Google Sheets.';
      if (msg === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
      } else {
        setSyncError(msg);
      }
      return null;
    } finally {
      setChecking(false);
    }
  }, [inspectForDeployRestore, setSheetFile]);

  const syncNowToSheet = useCallback(
    async (
      overrideSheetId?: string,
      options?: { forceOverwrite?: boolean },
    ): Promise<DriveFileMeta | null> => {
      if (!getGoogleWorkspaceToken()) {
        setNeedsAuth(true);
        setDriveDirty(true);
        return null;
      }

      if (isSyncRunningRef.current) {
        needsAnotherSyncRef.current = true;
        return sheetFileRef.current;
      }

      isSyncRunningRef.current = true;
      setSyncing(true);
      setSyncError('');

      let latestResult: DriveFileMeta | null = sheetFileRef.current;
      try {
        do {
          needsAnotherSyncRef.current = false;
          const snapshot = await getAdminBackup();
          let existingMeta = sheetFileRef.current;
          let targetId = overrideSheetId || existingMeta?.id;
          if (!targetId) {
            existingMeta = await findTka2027Spreadsheet();
            targetId = existingMeta?.id;
          }

          // Guard against wiping a populated TKA 2027 spreadsheet with an empty fresh server DB
          if (
            targetId &&
            !options?.forceOverwrite &&
            !dismissedRestorePromptRef.current &&
            isSnapshotEffectivelyEmpty(snapshot)
          ) {
            const remote = await readTka2027Spreadsheet(targetId).catch(() => null);
            if (remote && !isSnapshotEffectivelyEmpty(remote)) {
              const meta: DriveFileMeta = existingMeta || {
                id: targetId,
                name: TKA_SPREADSHEET_TITLE,
                webViewLink: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(targetId)}/edit`,
              };
              setSheetFile(meta);
              setPendingSheetRestore({ snapshot: remote, fileMeta: meta });
              setSyncError(
                `Google Sheet ${TKA_SPREADSHEET_TITLE} sudah berisi data tersimpan. Pulihkan data agar isi Sheet tidak tertimpa data kosong.`,
              );
              return null;
            }
          }

          const updated = await writeTka2027Spreadsheet(snapshot, targetId);
          setSheetFile(updated);
          latestResult = updated;
          setDriveDirty(false);
          setSyncMessage(`Tersimpan ke Sheet ${TKA_SPREADSHEET_TITLE}`);
          void saveSheetSyncConfig({
            dirty: false,
            sheetId: updated.id,
            sheetName: updated.name,
            lastSyncedAt: Date.now(),
          }).catch(() => {});
        } while (needsAnotherSyncRef.current);

        return latestResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal menyimpan ke Google Sheets.';
        setDriveDirty(true);
        if (msg === 'AUTH_REQUIRED') {
          setNeedsAuth(true);
          setSyncError(
            autoSyncEnabledRef.current
              ? 'Sesi Google berakhir. Hubungkan kembali Google untuk melanjutkan simpan otomatis.'
              : 'Sesi Google berakhir. Silakan hubungkan kembali akun Google Anda.',
          );
        } else {
          setSyncError(`Gagal sinkron ke Sheet: ${msg}`);
        }
        return null;
      } finally {
        isSyncRunningRef.current = false;
        setSyncing(false);
      }
    },
    [setDriveDirty, setSheetFile],
  );

  useEffect(() => {
    const unsub = initGoogleWorkspaceAuth(
      (user, token) => {
        setGoogleUser(user);
        setNeedsAuth(!token);
      },
      () => {
        // Keep autoSyncEnabled permanently active even if browser token isn't in memory
        setGoogleUser(null);
        setNeedsAuth(true);
      },
    );
    return unsub;
  }, []);

  // On mount/auth ready: verify sheet metadata and auto-flush pending server changes if permanent autoSync is active
  useEffect(() => {
    if (!needsAuth) {
      void checkSheetFile().then(async (found) => {
        if (found && !dismissedRestorePromptRef.current) {
          const restoreNeeded = await inspectForDeployRestore(found);
          if (restoreNeeded) return;
        }
        if (autoSyncEnabledRef.current && (driveDirtyRef.current || !found)) {
          void syncNowToSheet(found?.id);
        }
      });
    }
  }, [needsAuth, checkSheetFile, inspectForDeployRestore, syncNowToSheet]);

  const signIn = useCallback(
    async (promptAutoSyncAfter = true) => {
      setSyncError('');
      setSyncMessage('');
      setSigningIn(true);
      try {
        const res = await signInGoogleWorkspace();
        setGoogleUser(res.user);
        setNeedsAuth(false);
        const found = await checkSheetFile();
        if (found && !dismissedRestorePromptRef.current) {
          const restoreNeeded = await inspectForDeployRestore(found);
          if (restoreNeeded) return;
        }
        if (autoSyncEnabledRef.current) {
          if (driveDirtyRef.current || !found) {
            await syncNowToSheet(found?.id);
          }
        } else if (promptAutoSyncAfter) {
          dismissedPromptRef.current = false;
          setAutoSyncPromptOpen(true);
        }
      } catch (err) {
        setSyncError(
          err instanceof Error
            ? err.message
            : 'Gagal terhubung ke akun Google. Pastikan jendela pop-up diizinkan.',
        );
      } finally {
        setSigningIn(false);
      }
    },
    [checkSheetFile, inspectForDeployRestore, syncNowToSheet],
  );

  const signOut = useCallback(async () => {
    await signOutGoogleWorkspace();
    setGoogleUser(null);
    setNeedsAuth(true);
    setAutoSyncPromptOpen(false);
    setSyncMessage('');
    setSyncError('');
  }, []);

  const requestEnableAutoSync = useCallback(async () => {
    if (!getGoogleWorkspaceToken()) {
      await signIn(true);
      return;
    }
    dismissedPromptRef.current = false;
    setAutoSyncPromptOpen(true);
  }, [signIn]);

  const confirmEnableAutoSync = useCallback(async () => {
    autoSyncEnabledRef.current = true;
    setAutoSyncEnabled(true);
    setAutoSyncPromptOpen(false);
    try {
      await saveSheetSyncConfig({ autoSync: true });
    } catch {
      // Keep local active state and retry persisting during next save
    }
    await syncNowToSheet();
  }, [syncNowToSheet]);

  const dismissAutoSyncPrompt = useCallback(() => {
    dismissedPromptRef.current = true;
    setAutoSyncPromptOpen(false);
  }, []);

  const disableAutoSync = useCallback(async () => {
    autoSyncEnabledRef.current = false;
    setAutoSyncEnabled(false);
    try {
      await saveSheetSyncConfig({ autoSync: false });
    } catch {
      // ignore transient error
    }
    setSyncMessage('Simpan otomatis ke Google Sheets dimatikan (mode manual).');
  }, []);

  const notifyDataSaved = useCallback(async (): Promise<boolean> => {
    setDriveDirty(true);
    if (getGoogleWorkspaceToken() && autoSyncEnabledRef.current) {
      const updated = await syncNowToSheet();
      return Boolean(updated);
    }
    if (
      getGoogleWorkspaceToken() &&
      !autoSyncEnabledRef.current &&
      !dismissedPromptRef.current
    ) {
      setAutoSyncPromptOpen(true);
    }
    return false;
  }, [setDriveDirty, syncNowToSheet]);

  const applyRestoredSyncState = useCallback(
    (next?: SheetSyncConfig) => {
      if (typeof next?.autoSync === 'boolean') {
        autoSyncEnabledRef.current = next.autoSync;
        setAutoSyncEnabled(next.autoSync);
      }
      setDriveDirty(Boolean(next?.dirty));
    },
    [setDriveDirty],
  );

  return {
    googleUser,
    needsAuth,
    signingIn,
    checking,
    syncing,
    sheetFile,
    setSheetFile,
    autoSyncEnabled,
    autoSyncPromptOpen,
    pendingSheetRestore,
    dismissPendingSheetRestore,
    markSheetConnectedMeta,
    syncMessage,
    syncError,
    driveDirty,
    setDriveDirty,
    checkSheetFile,
    signIn,
    signOut,
    requestEnableAutoSync,
    confirmEnableAutoSync,
    dismissAutoSyncPrompt,
    disableAutoSync,
    syncNowToSheet,
    notifyDataSaved,
    applyRestoredSyncState,
    clearMessages,
  };
}
