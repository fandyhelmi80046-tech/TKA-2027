import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SESSION_TTL_MS = 6 * 3600 * 1000;

interface StoredUser {
  u: string;
  n: string;
  k: string;
  g: string;
  role: 'admin' | 'siswa';
  passwordHash: string;
  cardPassword: string;
}

interface StoredQuestion {
  id: string;
  mapel: string;
  topik: string;
  paket: number;
  s: string;
  t: string;
  o: [string, string, string, string];
  a: number;
}

interface StoredExam {
  id: string;
  mapel: string;
  paket: number;
  aktif: boolean;
  token: string;
  menit: number;
  acak: boolean;
}

interface StoredSession {
  id: string;
  nm: string;
  e: string;
  tgl: string;
  jam: string;
  bm: number;
  tzOffset?: number;
  ps: string[];
}

interface StoredProgress {
  u: string;
  n: string;
  m: string;
  p: number;
  e: string;
  no: number;
  tot: number;
  j: number;
  r: number;
  s: number;
  st: 'Mengerjakan' | 'Selesai';
  ts: number;
  ans: number[];
  flg: boolean[];
  cur: number;
}

interface StoredResult {
  id: string;
  u: string;
  n: string;
  k: string;
  m: string;
  p: number;
  b: number;
  tot: number;
  nilai: number;
  d: [string, number][];
  w: number;
}

interface StoredSheetSync {
  autoSync: boolean;
  dirty: boolean;
  sheetId?: string;
  sheetName?: string;
  lastSyncedAt?: number;
}

interface StoredDB {
  salt: string;
  ident: { nama: string; sub: string; logo: string };
  users: StoredUser[];
  soal: StoredQuestion[];
  ujian: StoredExam[];
  sesi: StoredSession[];
  progress: Record<string, StoredProgress>;
  hasil: StoredResult[];
  sheetSync: StoredSheetSync;
}

interface SessionPayload {
  u: string;
  role: 'admin' | 'siswa';
  n: string;
  e?: string;
  m?: string;
  p?: number;
  exp: number;
}

function createInitialDB(): StoredDB {
  const biPassage =
    'Danau Tenang berada di kaki bukit dan dikelilingi hutan pinus. Airnya jernih, dan pada pagi hari kabut tipis menyelimuti permukaannya. Burung-burung berkicau dari dahan, sementara angin membawa aroma tanah basah.\n\n' +
    'Fasilitas di kawasan ini cukup lengkap. Tersedia area parkir, warung makan, dan perahu sewaan. Namun, sampah pengunjung masih sering terlihat di tepi danau sehingga pengelola perlu menambah petugas kebersihan.';

  return {
    salt: crypto.randomBytes(16).toString('hex'),
    ident: {
      nama: 'TRY OUT',
      sub: 'Aplikasi Simulasi TKA',
      logo: '',
    },
    users: [
      {
        u: 'admin',
        n: 'Administrator',
        k: '',
        g: '',
        role: 'admin',
        passwordHash: '',
        cardPassword: '',
      },
    ],
    soal: [
      {
        id: 'bi-1',
        mapel: 'Bahasa Indonesia',
        topik: 'Membaca',
        paket: 1,
        s: biPassage,
        t: 'Kata yang menggambarkan suasana tenang pada teks ulasan ditunjukkan pada frasa ....',
        o: ['kabut tipis', 'air jernih', 'dahan pohon', 'tanah basah'],
        a: 0,
      },
      {
        id: 'bi-2',
        mapel: 'Bahasa Indonesia',
        topik: 'Membaca',
        paket: 1,
        s: biPassage,
        t: 'Kritik terhadap tempat wisata dalam teks ditunjukkan pada kalimat ....',
        o: [
          'Danau Tenang berada di kaki bukit.',
          'Tersedia area parkir dan warung makan.',
          'Sampah pengunjung masih sering terlihat.',
          'Burung-burung berkicau dari dahan.',
        ],
        a: 2,
      },
      {
        id: 'bi-3',
        mapel: 'Bahasa Indonesia',
        topik: 'Membaca',
        paket: 1,
        s: biPassage,
        t: 'Saran yang tepat bagi pengelola berdasarkan teks adalah ....',
        o: [
          'menambah perahu sewaan',
          'menambah petugas kebersihan',
          'memperluas area parkir',
          'menutup wisata danau',
        ],
        a: 1,
      },
      {
        id: 'bi-4',
        mapel: 'Bahasa Indonesia',
        topik: 'Kebahasaan',
        paket: 1,
        s: '',
        t: 'Kalimat efektif terdapat pada ....',
        o: [
          'Para siswa-siswa membaca buku.',
          'Siswa membaca buku di perpustakaan.',
          'Buku dibaca oleh para siswa-siswa itu semua.',
          'Siswa-siswa itu membaca buku-buku.',
        ],
        a: 1,
      },
      {
        id: 'bi-5',
        mapel: 'Bahasa Indonesia',
        topik: 'Kebahasaan',
        paket: 1,
        s: '',
        t: 'Sinonim kata "gigih" adalah ....',
        o: ['malas', 'tekun', 'ragu', 'cepat'],
        a: 1,
      },
      {
        id: 'mtk-1',
        mapel: 'Matematika',
        topik: 'Aritmetika',
        paket: 1,
        s: '',
        t: 'Hasil dari 3/4 + 5/8 adalah ....',
        o: ['8/12', '11/8', '9/8', '7/8'],
        a: 1,
      },
      {
        id: 'mtk-2',
        mapel: 'Matematika',
        topik: 'Aljabar',
        paket: 1,
        s: '',
        t: 'Nilai x yang memenuhi 3x − 7 = 11 adalah ....',
        o: ['4', '5', '6', '7'],
        a: 2,
      },
      {
        id: 'mtk-3',
        mapel: 'Matematika',
        topik: 'Statistika',
        paket: 1,
        s: '',
        t: 'Rata-rata dari 6, 8, 10, 12, 14 adalah ....',
        o: ['9', '10', '11', '12'],
        a: 1,
      },
      {
        id: 'mtk-4',
        mapel: 'Matematika',
        topik: 'Aritmetika sosial',
        paket: 1,
        s: '',
        t: 'Harga buku Rp15.000 diskon 20%. Harga yang dibayar adalah ....',
        o: ['Rp10.000', 'Rp11.000', 'Rp12.000', 'Rp13.000'],
        a: 2,
      },
      {
        id: 'mtk-5',
        mapel: 'Matematika',
        topik: 'Peluang',
        paket: 1,
        s: '',
        t: 'Peluang muncul angka genap pada pelemparan satu dadu adalah ....',
        o: ['1/6', '1/3', '1/2', '2/3'],
        a: 2,
      },
    ],
    ujian: [
      { id: 'U1', mapel: 'Bahasa Indonesia', paket: 1, aktif: true, token: '', menit: 75, acak: true },
      { id: 'U2', mapel: 'Matematika', paket: 1, aktif: true, token: '', menit: 75, acak: true },
    ],
    sesi: [],
    progress: {},
    hasil: [],
    sheetSync: { autoSync: false, dirty: false },
  };
}

function normalizeSheetSync(raw?: Partial<StoredSheetSync>): StoredSheetSync {
  return {
    autoSync: Boolean(raw?.autoSync),
    dirty: Boolean(raw?.dirty),
    ...(typeof raw?.sheetId === 'string' && raw.sheetId ? { sheetId: raw.sheetId.slice(0, 128) } : {}),
    ...(typeof raw?.sheetName === 'string' && raw.sheetName
      ? { sheetName: raw.sheetName.slice(0, 120) }
      : {}),
    ...(typeof raw?.lastSyncedAt === 'number' && Number.isFinite(raw.lastSyncedAt)
      ? { lastSyncedAt: raw.lastSyncedAt }
      : {}),
  };
}

function loadDB(): StoredDB {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredDB>;
      const base = createInitialDB();
      return {
        salt: typeof parsed.salt === 'string' && parsed.salt ? parsed.salt : base.salt,
        ident: parsed.ident && typeof parsed.ident.nama === 'string' ? parsed.ident : base.ident,
        users: Array.isArray(parsed.users) ? parsed.users : base.users,
        soal: Array.isArray(parsed.soal) ? parsed.soal : base.soal,
        ujian: Array.isArray(parsed.ujian) ? parsed.ujian : base.ujian,
        sesi: Array.isArray(parsed.sesi) ? parsed.sesi : base.sesi,
        progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
        hasil: Array.isArray(parsed.hasil) ? parsed.hasil : [],
        sheetSync: normalizeSheetSync(parsed.sheetSync),
      };
    }
  } catch (err) {
    console.error('Failed to read db.json, reinitializing:', err);
  }
  const fresh = createInitialDB();
  persistDBSync(fresh);
  return fresh;
}

function persistDBSync(db: StoredDB): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

let db: StoredDB = loadDB();
let writeQueue: Promise<void> = Promise.resolve();

function saveDB(): Promise<void> {
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmpFile, snapshot, 'utf8');
    await fs.promises.rename(tmpFile, DB_FILE);
  });
  return writeQueue;
}

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(plain: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(plain, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function timingSafeStringMatch(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function signSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySession(token: string): SessionPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Deterministic Fisher-Yates shuffle matching Apps Script / Claude implementation
function hashSeed32(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function createRng(seed: string): () => number {
  let a = hashSeed32(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: T[], rnd: () => number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function computeLayout(questions: StoredQuestion[], username: string, exam: StoredExam) {
  const n = questions.length;
  const identityOrder = Array.from({ length: n }, (_, i) => i);
  if (!exam.acak) {
    return { order: identityOrder, opt: identityOrder.map(() => [0, 1, 2, 3]) };
  }
  const rnd = createRng(`${username}|${exam.id}|${db.salt}`);
  const groups: number[][] = [];
  const indexMap: Record<string, number> = {};
  questions.forEach((q, idx) => {
    const key = q.s ? `s:${q.s}` : `q:${idx}`;
    if (indexMap[key] == null) {
      indexMap[key] = groups.length;
      groups.push([]);
    }
    groups[indexMap[key]].push(idx);
  });
  const order = shuffleArray(groups, rnd).flat();
  const opt = order.map(() => shuffleArray([0, 1, 2, 3], rnd));
  return { order, opt };
}

function getEnvAdminPasscode(): string {
  return (process.env.ADMIN_PASSCODE || '').trim();
}

function isAdminSetupRequired(): boolean {
  if (getEnvAdminPasscode()) return false;
  return !db.users.some((u) => u.role === 'admin' && Boolean(u.passwordHash));
}

function activeExamForSubject(mapel: string): StoredExam | undefined {
  return db.ujian.find(
    (ex) =>
      ex.mapel === mapel &&
      ex.aktif &&
      db.soal.some((q) => q.mapel === ex.mapel && Number(q.paket) === Number(ex.paket)),
  );
}

// Login rate limiter: max 5 failures per username in 10 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= 5;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

function clearFailures(key: string): void {
  loginAttempts.delete(key);
}

function sanitizeLogo(logo: unknown): string {
  if (typeof logo !== 'string' || !logo) return '';
  if (logo.length > 512 * 1024) {
    throw new Error('Ukuran logo terlalu besar (maksimal 512 KB).');
  }
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
    throw new Error('Format logo harus PNG, JPEG, atau WebP.');
  }
  return logo;
}

interface AuthedRequest extends Request {
  session?: SessionPayload;
}

function requireRole(role: 'admin' | 'siswa') {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = token ? verifySession(token) : null;
    if (!session) {
      res.status(401).json({ error: 'Sesi berakhir. Silakan login kembali.' });
      return;
    }
    if (session.role !== role) {
      res.status(403).json({ error: 'Tidak diizinkan.' });
      return;
    }
    req.session = session;
    next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Public bootstrap info (no secrets or answer keys)
  app.get('/api/public', (_req, res) => {
    const activeSubjects: string[] = [];
    for (const ex of db.ujian) {
      if (
        ex.aktif &&
        !activeSubjects.includes(ex.mapel) &&
        db.soal.some((q) => q.mapel === ex.mapel && Number(q.paket) === Number(ex.paket))
      ) {
        activeSubjects.push(ex.mapel);
      }
    }
    res.json({
      ident: db.ident,
      mapel: activeSubjects,
      adminSetupRequired: isAdminSetupRequired(),
      adminPasscodeManagedByEnv: Boolean(getEnvAdminPasscode()),
      autoSyncSheet: db.sheetSync.autoSync,
      sheetId: db.sheetSync.sheetId || '',
    });
  });

  // One-time admin password setup when ADMIN_PASSCODE env is unset and no admin hash exists
  app.post('/api/admin/bootstrap', async (req, res) => {
    if (getEnvAdminPasscode()) {
      res.status(409).json({ error: 'Kata sandi admin dikelola oleh konfigurasi server (ADMIN_PASSCODE).' });
      return;
    }
    if (!isAdminSetupRequired()) {
      res.status(409).json({ error: 'Akun admin sudah diaktifkan. Silakan login seperti biasa.' });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const nama = typeof req.body?.nama === 'string' && req.body.nama.trim() ? req.body.nama.trim().slice(0, 80) : 'Administrator';
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    const existingAdmin = db.users.find((u) => u.role === 'admin');
    if (existingAdmin) {
      existingAdmin.passwordHash = hashPassword(password);
      existingAdmin.n = nama;
    } else {
      db.users.unshift({
        u: 'admin',
        n: nama,
        k: '',
        g: '',
        role: 'admin',
        passwordHash: hashPassword(password),
        cardPassword: '',
      });
    }
    await saveDB();
    const adminUser = db.users.find((u) => u.role === 'admin')!;
    const token = signSession({
      u: adminUser.u,
      role: 'admin',
      n: adminUser.n,
      exp: Date.now() + SESSION_TTL_MS,
    });
    res.json({
      token,
      role: 'admin',
      user: { u: adminUser.u, n: adminUser.n },
    });
  });

  // Login (admin & siswa)
  app.post('/api/login', (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const mapel = typeof req.body?.mapel === 'string' ? req.body.mapel.trim() : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const rateKey = username.slice(0, 100);
    if (checkRateLimit(rateKey)) {
      res.status(429).json({ error: 'Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi.' });
      return;
    }

    const user = db.users.find((u) => u.u === username);
    if (!user) {
      recordFailure(rateKey);
      res.status(401).json({ error: 'Username atau password salah.' });
      return;
    }

    if (user.role === 'admin') {
      const envCode = getEnvAdminPasscode();
      let valid = false;
      if (envCode) {
        valid = timingSafeStringMatch(password, envCode);
      } else if (user.passwordHash) {
        valid = verifyPassword(password, user.passwordHash);
      } else {
        res.status(400).json({ error: 'Kata sandi admin belum diatur. Lakukan pengaturan awal terlebih dahulu.' });
        return;
      }
      if (!valid) {
        recordFailure(rateKey);
        res.status(401).json({ error: 'Username atau password salah.' });
        return;
      }
      clearFailures(rateKey);
      const token = signSession({
        u: user.u,
        role: 'admin',
        n: user.n,
        exp: Date.now() + SESSION_TTL_MS,
      });
      res.json({
        token,
        role: 'admin',
        user: { u: user.u, n: user.n },
      });
      return;
    }

    // Student auth
    if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      recordFailure(rateKey);
      res.status(401).json({ error: 'Username atau password salah.' });
      return;
    }
    clearFailures(rateKey);

    if (!mapel) {
      res.status(400).json({ error: 'Pilih mata pelajaran terlebih dahulu.', back: true });
      return;
    }

    const exam = activeExamForSubject(mapel);
    if (!exam) {
      res.status(404).json({ error: 'Tidak ada ujian aktif untuk mata pelajaran ini.' });
      return;
    }

    // Student must have an exam card (enrolled in at least one session)
    const studentHasAnyCard = db.sesi.length > 0 && db.sesi.some((s) => s.ps.includes(user.u));
    if (!studentHasAnyCard) {
      res.status(403).json({
        error: 'Anda belum memiliki kartu ujian. Silakan hubungi proktor atau admin.',
      });
      return;
    }

    const sessions = db.sesi.filter((s) => s.e === exam.id);
    if (sessions.length === 0) {
      res.status(403).json({
        error: 'Sesi ujian untuk mata pelajaran ini belum dibuat. Hubungi proktor atau admin.',
      });
      return;
    }

    const progKey = `${exam.id}|${user.u}`;
    const existingProg = db.progress[progKey];
    const resuming = Boolean(existingProg && existingProg.st !== 'Selesai');

    const mine = sessions.filter((s) => s.ps.includes(user.u));
    if (mine.length === 0) {
      res.status(403).json({
        error: 'Bukan sesi Anda, silakan cek pada kartu ujian.',
      });
      return;
    }

    const now = Date.now();
    const parseStart = (z: StoredSession) => {
      const tzOffset =
        typeof z.tzOffset === 'number' && Number.isFinite(z.tzOffset) ? z.tzOffset : -420;
      const utcBase = Date.parse(`${z.tgl}T${z.jam}:00Z`);
      if (Number.isFinite(utcBase)) {
        return utcBase + tzOffset * 60000;
      }
      return new Date(`${z.tgl}T${z.jam}`).getTime();
    };

    const isSessionOpen = (z: StoredSession) => {
      const startMs = parseStart(z);
      if (!Number.isFinite(startMs) || startMs > now) return false;
      if (z.bm && now > startMs + z.bm * 60000) return false;
      const superseded = sessions.some(
        (other) =>
          other.id !== z.id &&
          !other.ps.includes(user.u) &&
          parseStart(other) > startMs &&
          parseStart(other) <= now,
      );
      return !superseded;
    };

    const mineOpen = mine.some((z) => isSessionOpen(z));
    if (!mineOpen && !resuming) {
      const otherSessionOpen = sessions.some((s) => !s.ps.includes(user.u) && isSessionOpen(s));
      const supersededByOther = mine.every((z) =>
        sessions.some(
          (other) =>
            other.id !== z.id &&
            !other.ps.includes(user.u) &&
            parseStart(other) > parseStart(z) &&
            parseStart(other) <= now,
        ),
      );
      if (otherSessionOpen || supersededByOther) {
        res.status(403).json({
          error: 'Bukan sesi Anda, silakan cek pada kartu ujian.',
        });
        return;
      }
      if (!mine.some((z) => parseStart(z) <= now)) {
        res.status(403).json({
          error: `Ujian belum dimulai. Jadwal sesi Anda: ${mine[0].tgl} pukul ${mine[0].jam} (cek pada kartu ujian).`,
        });
        return;
      }
      res.status(403).json({
        error: 'Sesi ujian Anda sudah ditutup (melewati batas masuk). Silakan cek pada kartu ujian.',
      });
      return;
    }

    const token = signSession({
      u: user.u,
      role: 'siswa',
      n: user.n,
      e: exam.id,
      m: exam.mapel,
      p: exam.paket,
      exp: Date.now() + SESSION_TTL_MS,
    });

    res.json({
      token,
      role: 'siswa',
      user: { u: user.u, n: user.n, g: user.g, k: user.k },
      ujian: { id: exam.id, paket: exam.paket, menit: exam.menit, mapel: exam.mapel, resuming },
    });
  });

  // Student: validate token and fetch shuffled questions (without answer keys)
  app.post('/api/exam/start', requireRole('siswa'), (req: AuthedRequest, res) => {
    const sess = req.session!;
    const exam = db.ujian.find((e) => e.id === sess.e);
    if (!exam || !exam.token) {
      res.status(400).json({ error: 'Token ujian belum dirilis oleh admin. Hubungi proktor.' });
      return;
    }
    const inputToken = typeof req.body?.token === 'string' ? req.body.token.trim().toUpperCase() : '';
    if (inputToken !== exam.token.trim().toUpperCase()) {
      res.status(403).json({ error: 'Token yang Anda masukkan salah.' });
      return;
    }
    const alreadyDone = db.hasil.some(
      (h) => h.u === sess.u && h.m === exam.mapel && Number(h.p) === Number(exam.paket),
    );
    if (alreadyDone) {
      res.status(409).json({ error: 'Anda sudah menyelesaikan ujian ini.' });
      return;
    }

    const bank = db.soal.filter(
      (q) => q.mapel === exam.mapel && Number(q.paket) === Number(exam.paket),
    );
    const layout = computeLayout(bank, sess.u, exam);
    const qs = layout.order.map((origIdx, j) => {
      const q = bank[origIdx];
      const opts = layout.opt[j].map((k) => q.o[k]) as [string, string, string, string];
      return { t: q.t, o: opts, s: q.s || '' };
    });

    const progKey = `${exam.id}|${sess.u}`;
    const saved = db.progress[progKey];
    let ans: number[] | undefined;
    let flg: boolean[] | undefined;
    let cur: number | undefined;
    let sisa = (Number(exam.menit) || 75) * 60;

    if (saved && Array.isArray(saved.ans) && saved.ans.length === qs.length && saved.st !== 'Selesai') {
      ans = saved.ans;
      flg = saved.flg;
      cur = saved.cur || 0;
      sisa = Math.max(0, saved.s - Math.floor((Date.now() - saved.ts) / 1000));
    }

    res.json({ qs, sisa, ans, flg, cur });
  });

  // Student: periodic save for live monitoring & resume
  app.post('/api/exam/save', requireRole('siswa'), async (req: AuthedRequest, res) => {
    const sess = req.session!;
    const exam = db.ujian.find((e) => e.id === sess.e);
    if (!exam) {
      res.status(404).json({ error: 'Ujian tidak ditemukan.' });
      return;
    }
    const ans = Array.isArray(req.body?.ans) ? req.body.ans.map((x: unknown) => Number(x)) : [];
    const flg = Array.isArray(req.body?.flg) ? req.body.flg.map((x: unknown) => Boolean(x)) : [];
    const cur = Math.max(0, Number(req.body?.cur) || 0);
    const left = Math.max(0, Number(req.body?.left) || 0);
    const st = req.body?.st === 'Selesai' ? 'Selesai' : 'Mengerjakan';

    const progKey = `${exam.id}|${sess.u}`;
    db.progress[progKey] = {
      u: sess.u,
      n: sess.n,
      m: exam.mapel,
      p: exam.paket,
      e: exam.id,
      no: cur + 1,
      tot: ans.length,
      j: ans.filter((a: number) => a >= 0).length,
      r: flg.filter(Boolean).length,
      s: left,
      st,
      ts: Date.now(),
      ans,
      flg,
      cur,
    };
    await saveDB();
    res.json({ ok: true });
  });

  // Student: finish and grade on server
  app.post('/api/exam/finish', requireRole('siswa'), async (req: AuthedRequest, res) => {
    const sess = req.session!;
    const exam = db.ujian.find((e) => e.id === sess.e);
    if (!exam) {
      res.status(404).json({ error: 'Ujian tidak ditemukan.' });
      return;
    }

    const existing = db.hasil.find(
      (h) => h.u === sess.u && h.m === exam.mapel && Number(h.p) === Number(exam.paket),
    );
    if (existing) {
      res.json({
        benar: existing.b,
        tot: existing.tot,
        nilai: existing.nilai,
        resultRow: existing,
      });
      return;
    }

    const ans = Array.isArray(req.body?.ans) ? req.body.ans.map((x: unknown) => Number(x)) : [];
    const bank = db.soal.filter(
      (q) => q.mapel === exam.mapel && Number(q.paket) === Number(exam.paket),
    );
    const layout = computeLayout(bank, sess.u, exam);

    let benar = 0;
    const detail: [string, number][] = [];
    layout.order.forEach((origIdx, j) => {
      const q = bank[origIdx];
      const chosenOrigIdx = layout.opt[j][ans[j]];
      const ok = chosenOrigIdx === q.a;
      if (ok) benar += 1;
      detail.push([q.topik || '-', ok ? 1 : 0]);
    });

    const nilai = bank.length ? Math.round((benar / bank.length) * 100) : 0;
    const userObj = db.users.find((u) => u.u === sess.u);
    const resultRow: StoredResult = {
      id: crypto.randomUUID().slice(0, 8),
      u: sess.u,
      n: sess.n,
      k: userObj?.k || '-',
      m: exam.mapel,
      p: exam.paket,
      b: benar,
      tot: bank.length,
      nilai,
      d: detail,
      w: Date.now(),
    };
    db.hasil.push(resultRow);

    const progKey = `${exam.id}|${sess.u}`;
    if (db.progress[progKey]) {
      db.progress[progKey].st = 'Selesai';
      db.progress[progKey].s = 0;
      db.progress[progKey].ts = Date.now();
      db.progress[progKey].ans = ans;
    }
    db.sheetSync.dirty = true;

    await saveDB();
    res.json({ benar, tot: bank.length, nilai, resultRow });
  });

  // Admin: get full database (sanitized: never return passwordHash)
  app.get('/api/admin/data', requireRole('admin'), (_req, res) => {
    res.json({
      ident: db.ident,
      users: db.users.map((u) => ({
        u: u.u,
        n: u.n,
        k: u.k,
        g: u.g,
        role: u.role === 'admin' ? 'admin' : 'siswa',
        p: u.cardPassword,
        hasPassword: Boolean(u.passwordHash),
      })),
      soal: db.soal,
      ujian: db.ujian,
      sesi: db.sesi,
      sheetSync: db.sheetSync,
    });
  });

  // Admin: save database mutations
  app.post('/api/admin/save', requireRole('admin'), async (req, res) => {
    try {
      const body = req.body;
      if (!body || !Array.isArray(body.users) || !Array.isArray(body.soal) || !Array.isArray(body.ujian) || !Array.isArray(body.sesi)) {
        res.status(400).json({ error: 'Format data tidak valid.' });
        return;
      }

      if (!body.users.some((u: { role?: string }) => u.role === 'admin')) {
        res.status(400).json({ error: 'Minimal satu akun admin diperlukan.' });
        return;
      }

      const oldUserMap = new Map(db.users.map((u) => [u.u, u]));
      const seenUsernames = new Set<string>();
      const nextUsers: StoredUser[] = [];
      for (const u of body.users as Array<Record<string, unknown>>) {
        const username = String(u.u || '').trim();
        if (!username) {
          res.status(400).json({ error: 'Username pengguna tidak boleh kosong.' });
          return;
        }
        const norm = username.toLowerCase();
        if (seenUsernames.has(norm)) {
          res.status(400).json({
            error: `Username "${username}" ganda. Tidak boleh ada username yang sama.`,
          });
          return;
        }
        seenUsernames.add(norm);

        const plainPw = typeof u.p === 'string' ? u.p : '';
        const old = oldUserMap.get(username);
        const role = u.role === 'admin' ? 'admin' : 'siswa';
        let passwordHash = old?.passwordHash || '';
        let cardPassword = old?.cardPassword || '';

        if (plainPw) {
          passwordHash = hashPassword(plainPw);
          cardPassword = role === 'admin' ? '' : plainPw;
        } else if (u.clearCardPassword === true) {
          cardPassword = '';
        }

        nextUsers.push({
          u: username,
          n: String(u.n || '').trim(),
          k: String(u.k || '').trim(),
          g: String(u.g || '').trim(),
          role,
          passwordHash,
          cardPassword,
        });
      }

      const nextSoal: StoredQuestion[] = body.soal.map((q: Record<string, unknown>) => {
        const opts = Array.isArray(q.o) ? q.o.slice(0, 4).map((x) => String(x ?? '')) : ['', '', '', ''];
        while (opts.length < 4) opts.push('');
        return {
          id: String(q.id || crypto.randomUUID().slice(0, 8)),
          mapel: String(q.mapel || '').trim(),
          topik: String(q.topik || '-').trim(),
          paket: Math.min(4, Math.max(1, Number(q.paket) || 1)),
          s: typeof q.s === 'string' ? q.s : '',
          t: String(q.t || '').trim(),
          o: opts as [string, string, string, string],
          a: Math.min(3, Math.max(0, Number(q.a) || 0)),
        };
      });

      const nextUjian: StoredExam[] = body.ujian.map((e: Record<string, unknown>) => ({
        id: String(e.id || crypto.randomUUID().slice(0, 8)),
        mapel: String(e.mapel || '').trim(),
        paket: Math.min(4, Math.max(1, Number(e.paket) || 1)),
        aktif: Boolean(e.aktif),
        token: String(e.token || '').trim().toUpperCase(),
        menit: Math.max(1, Math.min(300, Number(e.menit) || 75)),
        acak: e.acak !== false,
      }));

      const nextSesi: StoredSession[] = body.sesi.map((z: Record<string, unknown>) => ({
        id: String(z.id || crypto.randomUUID().slice(0, 8)),
        nm: String(z.nm || '').trim(),
        e: String(z.e || '').trim(),
        tgl: String(z.tgl || '').trim(),
        jam: String(z.jam || '').trim(),
        bm: Math.max(0, Number(z.bm) || 0),
        ...(typeof z.tzOffset === 'number' && Number.isFinite(z.tzOffset)
          ? { tzOffset: z.tzOffset }
          : {}),
        ps: Array.isArray(z.ps) ? z.ps.map((x) => String(x)) : [],
      }));

      const nextIdent = {
        nama: String(body.ident?.nama || 'TRY OUT').trim().slice(0, 80) || 'TRY OUT',
        sub: String(body.ident?.sub || '').trim().slice(0, 120),
        logo: sanitizeLogo(body.ident?.logo || ''),
      };

      db.ident = nextIdent;
      db.users = nextUsers;
      db.soal = nextSoal;
      db.ujian = nextUjian;
      db.sesi = nextSesi;
      db.sheetSync.dirty = true;

      await saveDB();
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan data.' });
    }
  });

  // Admin: live monitor + hasil
  app.get('/api/admin/extra', requireRole('admin'), (_req, res) => {
    const now = Date.now();
    const live: Record<string, Record<string, unknown>> = {};
    for (const prog of Object.values(db.progress)) {
      const prev = live[prog.u];
      if (!prev || Number(prev.ts) < prog.ts) {
        live[prog.u] = {
          n: prog.n,
          m: prog.m,
          p: prog.p,
          no: prog.no,
          tot: prog.tot,
          j: prog.j,
          r: prog.r,
          s: prog.s,
          st: prog.st,
          ts: prog.ts,
          age: now - prog.ts,
        };
      }
    }
    res.json({ live, hasil: db.hasil, sheetSync: db.sheetSync });
  });

  // Admin: reset student progress and result so they can retake
  app.post('/api/admin/reset', requireRole('admin'), async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const mapel = typeof req.body?.mapel === 'string' ? req.body.mapel : '';
    const paket = Number(req.body?.paket);
    if (!username || !mapel) {
      res.status(400).json({ error: 'Parameter reset tidak lengkap.' });
      return;
    }

    for (const [k, v] of Object.entries(db.progress)) {
      if (v.u === username && v.m === mapel && Number(v.p) === paket) {
        delete db.progress[k];
      }
    }
    db.hasil = db.hasil.filter(
      (h) => !(h.u === username && h.m === mapel && Number(h.p) === paket),
    );
    db.sheetSync.dirty = true;
    await saveDB();
    res.json({ ok: true });
  });

  // Admin: persist permanent Google Sheet auto-sync settings
  app.post('/api/admin/sheet-sync', requireRole('admin'), async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const next: StoredSheetSync = { ...db.sheetSync };
    if (typeof body.autoSync === 'boolean') next.autoSync = body.autoSync;
    if (typeof body.dirty === 'boolean') next.dirty = body.dirty;
    if (typeof body.sheetId === 'string') {
      next.sheetId = body.sheetId.trim().slice(0, 128) || undefined;
    }
    if (typeof body.sheetName === 'string') {
      next.sheetName = body.sheetName.trim().slice(0, 120) || undefined;
    }
    if (typeof body.lastSyncedAt === 'number' && Number.isFinite(body.lastSyncedAt)) {
      next.lastSyncedAt = body.lastSyncedAt;
    }
    db.sheetSync = normalizeSheetSync(next);
    await saveDB();
    res.json({ ok: true, sheetSync: db.sheetSync });
  });

  // Admin: export full database snapshot for Google Drive storage
  app.get('/api/admin/backup', requireRole('admin'), (_req, res) => {
    res.json({
      schemaVersion: 1,
      exportedAt: Date.now(),
      salt: db.salt,
      ident: db.ident,
      users: db.users,
      soal: db.soal,
      ujian: db.ujian,
      sesi: db.sesi,
      progress: db.progress,
      hasil: db.hasil,
      sheetSync: db.sheetSync,
    });
  });

  // Admin: restore full database snapshot downloaded from Google Drive
  app.post('/api/admin/restore', requireRole('admin'), async (req: AuthedRequest, res) => {
    try {
      const body = req.body;
      if (
        !body ||
        typeof body !== 'object' ||
        !Array.isArray(body.users) ||
        !Array.isArray(body.soal) ||
        !Array.isArray(body.ujian) ||
        !Array.isArray(body.sesi)
      ) {
        res.status(400).json({ error: 'Format file cadangan Google Drive tidak valid.' });
        return;
      }

      const currentAdmin = db.users.find((u) => u.u === req.session?.u && u.role === 'admin');

      const rawUsers = body.users as unknown[];
      const seenRestoreUsers = new Set<string>();
      const nextUsers: StoredUser[] = rawUsers
        .filter((u): u is Record<string, unknown> => Boolean(u && typeof u === 'object'))
        .map((u: Record<string, unknown>): StoredUser => {
          const role: 'admin' | 'siswa' = u.role === 'admin' ? 'admin' : 'siswa';
          let passwordHash = typeof u.passwordHash === 'string' ? u.passwordHash : '';
          let cardPassword = typeof u.cardPassword === 'string' ? u.cardPassword : '';
          if (!passwordHash && typeof u.p === 'string' && u.p) {
            passwordHash = hashPassword(u.p);
            if (role !== 'admin' && !cardPassword) cardPassword = u.p;
          }
          if (role === 'admin') cardPassword = '';
          return {
            u: String(u.u || '').trim().slice(0, 80),
            n: String(u.n || '').trim().slice(0, 120),
            k: String(u.k || '').trim().slice(0, 40),
            g: String(u.g || '').trim().slice(0, 20),
            role,
            passwordHash,
            cardPassword,
          };
        })
        .filter((u: StoredUser) => {
          if (!u.u) return false;
          const key = u.u.toLowerCase();
          if (seenRestoreUsers.has(key)) return false;
          seenRestoreUsers.add(key);
          return true;
        });

      if (!nextUsers.some((u) => u.role === 'admin')) {
        if (currentAdmin) {
          nextUsers.unshift(currentAdmin);
        } else {
          res.status(400).json({ error: 'Cadangan tidak memiliki akun administrator.' });
          return;
        }
      } else if (currentAdmin && currentAdmin.passwordHash) {
        const restoredAdmin = nextUsers.find((u) => u.u === currentAdmin.u && u.role === 'admin');
        if (restoredAdmin && !restoredAdmin.passwordHash) {
          restoredAdmin.passwordHash = currentAdmin.passwordHash;
        }
      }

      const rawSoal = body.soal as unknown[];
      const nextSoal: StoredQuestion[] = rawSoal
        .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
        .map((q: Record<string, unknown>) => {
          const opts = Array.isArray(q.o)
            ? q.o.slice(0, 4).map((x: unknown) => String(x ?? ''))
            : ['', '', '', ''];
          while (opts.length < 4) opts.push('');
          return {
            id: String(q.id || crypto.randomUUID().slice(0, 8)),
            mapel: String(q.mapel || '').trim(),
            topik: String(q.topik || '-').trim(),
            paket: Math.min(4, Math.max(1, Number(q.paket) || 1)),
            s: typeof q.s === 'string' ? q.s : '',
            t: String(q.t || '').trim(),
            o: opts as [string, string, string, string],
            a: Math.min(3, Math.max(0, Number(q.a) || 0)),
          };
        });

      const rawUjian = body.ujian as unknown[];
      const nextUjian: StoredExam[] = rawUjian
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
        .map((e: Record<string, unknown>) => ({
          id: String(e.id || crypto.randomUUID().slice(0, 8)),
          mapel: String(e.mapel || '').trim(),
          paket: Math.min(4, Math.max(1, Number(e.paket) || 1)),
          aktif: Boolean(e.aktif),
          token: String(e.token || '').trim().toUpperCase(),
          menit: Math.max(1, Math.min(300, Number(e.menit) || 75)),
          acak: e.acak !== false,
        }));

      const rawSesi = body.sesi as unknown[];
      const nextSesi: StoredSession[] = rawSesi
        .filter((z): z is Record<string, unknown> => Boolean(z && typeof z === 'object'))
        .map((z: Record<string, unknown>) => ({
          id: String(z.id || crypto.randomUUID().slice(0, 8)),
          nm: String(z.nm || '').trim(),
          e: String(z.e || '').trim(),
          tgl: String(z.tgl || '').trim(),
          jam: String(z.jam || '').trim(),
          bm: Math.max(0, Number(z.bm) || 0),
          ...(typeof z.tzOffset === 'number' && Number.isFinite(z.tzOffset)
            ? { tzOffset: z.tzOffset }
            : {}),
          ps: Array.isArray(z.ps) ? z.ps.map((x: unknown) => String(x)) : [],
        }));

      const rawHasil = Array.isArray(body.hasil) ? (body.hasil as unknown[]) : null;
      const nextHasil: StoredResult[] = rawHasil
        ? rawHasil
            .filter((h): h is Record<string, unknown> => Boolean(h && typeof h === 'object'))
            .map((h: Record<string, unknown>) => ({
              id: String(h.id || crypto.randomUUID().slice(0, 8)),
              u: String(h.u || ''),
              n: String(h.n || ''),
              k: String(h.k || '-'),
              m: String(h.m || ''),
              p: Math.min(4, Math.max(1, Number(h.p) || 1)),
              b: Math.max(0, Number(h.b) || 0),
              tot: Math.max(0, Number(h.tot) || 0),
              nilai: Math.max(0, Math.min(100, Number(h.nilai) || 0)),
              d: Array.isArray(h.d)
                ? (h.d as unknown[])
                    .filter((item): item is [unknown, unknown] => Array.isArray(item) && item.length >= 2)
                    .map(([topik, ok]: [unknown, unknown]) => [String(topik || '-'), Number(ok) ? 1 : 0] as [string, number])
                : [],
              w: Number(h.w) || Date.now(),
            }))
        : db.hasil;

      const nextProgress: Record<string, StoredProgress> =
        body.progress && typeof body.progress === 'object' && !Array.isArray(body.progress)
          ? (body.progress as Record<string, StoredProgress>)
          : {};

      const nextIdent = {
        nama: String(body.ident?.nama || 'TRY OUT').trim().slice(0, 80) || 'TRY OUT',
        sub: String(body.ident?.sub || '').trim().slice(0, 120),
        logo: sanitizeLogo(body.ident?.logo || ''),
      };

      if (typeof body.salt === 'string' && body.salt.length >= 8) {
        db.salt = body.salt.slice(0, 64);
      }
      db.ident = nextIdent;
      db.users = nextUsers;
      db.soal = nextSoal;
      db.ujian = nextUjian;
      db.sesi = nextSesi;
      db.hasil = nextHasil;
      db.progress = nextProgress;
      if (body.sheetSync && typeof body.sheetSync === 'object') {
        const incoming = body.sheetSync as Partial<StoredSheetSync>;
        db.sheetSync = normalizeSheetSync({
          ...db.sheetSync,
          ...(typeof incoming.autoSync === 'boolean' ? { autoSync: incoming.autoSync } : {}),
          dirty: false,
        });
      } else {
        db.sheetSync.dirty = false;
      }

      await saveDB();
      res.json({
        ok: true,
        data: {
          ident: db.ident,
          users: db.users.map((u) => ({
            u: u.u,
            n: u.n,
            k: u.k,
            g: u.g,
            role: u.role === 'admin' ? 'admin' : 'siswa',
            p: u.cardPassword,
            hasPassword: Boolean(u.passwordHash),
          })),
          soal: db.soal,
          ujian: db.ujian,
          sesi: db.sesi,
          sheetSync: db.sheetSync,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memulihkan data.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Try Out TKA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
