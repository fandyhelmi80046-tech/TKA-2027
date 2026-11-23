/**
 * TryOutTKA_lengkap.gs - SEMUA kode Apps Script dalam satu file.
 *
 * Cara pakai:
 * 1. Google Sheets > Extensions > Apps Script. Hapus isi file Code.gs bawaan.
 * 2. Tempel seluruh isi file ini, lalu simpan.
 * 3. Tambah file HTML bernama "index" (File > + > HTML) dan isi dengan index.html.
 * 4. Project Settings > atur zona waktu (misalnya Asia/Makassar).
 * 5. Jalankan fungsi setupSheets sekali (izinkan akses).
 * 6. Deploy > New deployment > Web app (Execute as: Me; Who has access: Anyone).
 */

// ============================================================
// BAGIAN 1 - Web app dan impor Google Formulir
// ============================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Try Out TKA')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Dipanggil dari aplikasi: google.script.run.importForm(sesi, url)
 * Formulir harus bertipe kuis, dengan kunci jawaban pada setiap soal pilihan ganda.
 * Hanya soal dengan tepat 4 opsi dan satu kunci yang diambil.
 */
function importForm(ses, url) {
  auth_(ses, 'admin');
  const form = FormApp.openByUrl(url);
  if (!form.isQuiz()) throw new Error('Formulir harus bertipe kuis (ada kunci jawaban).');
  const q = [];
  let skip = 0;
  form.getItems(FormApp.ItemType.MULTIPLE_CHOICE).forEach(function (it) {
    const m = it.asMultipleChoiceItem();
    const ch = m.getChoices();
    let a = -1;
    ch.forEach(function (c, i) { if (c.isCorrectAnswer()) a = i; });
    if (ch.length !== 4 || a < 0) { skip++; return; }
    q.push({ t: m.getTitle(), o: ch.map(function (c) { return c.getValue(); }), a: a });
  });
  return { q: q, skip: skip };
}

// ============================================================
// BAGIAN 2 - Pembuat sheet otomatis
// ============================================================

// Skema: nama sheet -> daftar kolom (baris 1)
const SKEMA = {
  identitas:    ['kunci', 'nilai'],
  pengguna:     ['username', 'sandi_hash', 'nama', 'kelas', 'jk', 'peran', 'sandi_kartu'],
  soal:         ['id', 'mapel', 'topik', 'paket', 'stimulus', 'pertanyaan',
                 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'kunci'],
  ujian:        ['id', 'mapel', 'paket', 'aktif', 'token', 'menit', 'acak'],
  sesi:         ['id', 'nama', 'ujian_id', 'tanggal', 'jam_mulai', 'batas_masuk'],
  sesi_peserta: ['sesi_id', 'username'],
  jawaban:      ['username', 'ujian_id', 'jawaban_json', 'ragu_json', 'sisa_waktu', 'terakhir_simpan'],
  hasil:        ['id', 'waktu', 'username', 'nama', 'kelas', 'mapel', 'paket', 'benar', 'total', 'nilai'],
  hasil_detail: ['hasil_id', 'nomor', 'topik', 'benar'],
  live:         ['username', 'nama', 'mapel', 'paket', 'soal_ke', 'total',
                 'terjawab', 'ragu', 'sisa_waktu', 'status', 'diperbarui'],
  log:          ['waktu', 'username', 'kejadian', 'detail']
};

// Pilihan dropdown: sheet -> kolom -> daftar nilai
const PILIHAN = {
  pengguna: { peran: ['siswa', 'admin'], jk: ['Laki-Laki', 'Perempuan'] },
  soal:     { paket: ['1', '2', '3', '4'], kunci: ['A', 'B', 'C', 'D'] },
  ujian:    { paket: ['1', '2', '3', '4'], aktif: ['TRUE', 'FALSE'], acak: ['TRUE', 'FALSE'] }
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Try Out TKA')
    .addItem('Buat / lengkapi semua sheet', 'setupSheets')
    .addToUi();
}

/** Simpan link Sheets (hanya perlu jika skrip tidak dibuat dari dalam Sheets). */
function setSpreadsheet(url) {
  PropertiesService.getScriptProperties().setProperty('SS_URL', url);
}

function getSS_() {
  const aktif = SpreadsheetApp.getActiveSpreadsheet();
  if (aktif) return aktif;
  const url = PropertiesService.getScriptProperties().getProperty('SS_URL');
  if (!url) {
    throw new Error('Jalankan setSpreadsheet("LINK_SHEETS") dahulu, ' +
      'atau buat skrip dari menu Extensions > Apps Script di dalam Google Sheets.');
  }
  return SpreadsheetApp.openByUrl(url);
}

/** Hash kata sandi (SHA-256 + garam acak yang tersimpan di Script Properties). */
function hashSandi(plain) {
  const props = PropertiesService.getScriptProperties();
  let garam = props.getProperty('GARAM');
  if (!garam) { garam = Utilities.getUuid(); props.setProperty('GARAM', garam); }
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    garam + plain, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}

function setupSheets() {
  const ss = getSS_();
  const dibuat = [], dilengkapi = [];

  Object.keys(SKEMA).forEach(function (nama) {
    const kolom = SKEMA[nama];
    let sh = ss.getSheetByName(nama);
    if (!sh) { sh = ss.insertSheet(nama); dibuat.push(nama); }

    // Header: tulis jika kosong; jika sudah ada, tambahkan kolom yang belum ada di ujung kanan.
    const lebar = sh.getLastColumn();
    const ada = lebar ? sh.getRange(1, 1, 1, lebar).getValues()[0].map(String) : [];
    kolom.forEach(function (k) {
      if (ada.indexOf(k) < 0) {
        sh.getRange(1, ada.length + 1).setValue(k);
        ada.push(k);
        if (dibuat.indexOf(nama) < 0 && dilengkapi.indexOf(nama) < 0) dilengkapi.push(nama);
      }
    });

    // Tampilan header
    sh.getRange(1, 1, 1, ada.length)
      .setFontWeight('bold').setBackground('#336699').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, ada.length);

    // Dropdown pada kolom tertentu (baris 2 sampai 2000)
    const pil = PILIHAN[nama] || {};
    Object.keys(pil).forEach(function (k) {
      const c = ada.indexOf(k) + 1;
      if (c < 1) return;
      sh.getRange(2, c, 1999, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(pil[k], true)
          .setAllowInvalid(false).build());
    });
  });

  isiDataAwal_(ss);
  hapusSheetBawaan_(ss);
  ss.setActiveSheet(ss.getSheetByName('pengguna'));

  const pesan = 'Dibuat: ' + (dibuat.join(', ') || '-') +
    '\nDilengkapi kolomnya: ' + (dilengkapi.join(', ') || '-');
  Logger.log(pesan);
  try { SpreadsheetApp.getUi().alert('Selesai', pesan, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

// Data awal: identitas aplikasi dan satu akun admin (hanya jika sheet masih kosong).
function isiDataAwal_(ss) {
  const idn = ss.getSheetByName('identitas');
  if (idn.getLastRow() < 2) {
    idn.getRange(2, 1, 3, 2).setValues([
      ['nama', 'TRY OUT'],
      ['sub', 'Aplikasi Simulasi TKA'],
      ['logo', '']
    ]);
  }
  const pg = ss.getSheetByName('pengguna');
  if (pg.getLastRow() < 2) {
    // Ganti kata sandi ini segera setelah login pertama.
    pg.getRange(2, 1, 1, 6).setValues([
      ['admin', hashSandi('admin123'), 'Administrator', '', '', 'admin']
    ]);
  }
}

function hapusSheetBawaan_(ss) {
  ['Sheet1', 'Sheet 1', 'Lembar1', 'Lembar 1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0 && sh.getLastColumn() === 0) {
      ss.deleteSheet(sh);
    }
  });
}

// ============================================================
// BAGIAN 3 - API aplikasi (login, ujian, admin)
// ============================================================

const SESI_DETIK = 6 * 3600;
let _ss;

function ss_() { return _ss || (_ss = getSS_()); }
function sh_(n) {
  const s = ss_().getSheetByName(n);
  if (!s) throw new Error('Sheet "' + n + '" belum ada. Jalankan setupSheets terlebih dahulu.');
  return s;
}
function head_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }

function rows_(n) {
  const sh = sh_(n), L = sh.getLastRow();
  if (L < 2) return [];
  const h = head_(sh);
  return sh.getRange(2, 1, L - 1, h.length).getDisplayValues()
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) { const o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}
function write_(n, objs) {
  const sh = sh_(n), h = head_(sh), last = Math.max(sh.getLastRow(), 2);
  sh.getRange(2, 1, last - 1, h.length).clearContent();
  if (!objs.length) return;
  const rg = sh.getRange(2, 1, objs.length, h.length);
  rg.setNumberFormat('@');
  rg.setValues(objs.map(function (o) { return h.map(function (k) { return o[k] == null ? '' : String(o[k]); }); }));
}
function append_(n, objs) {
  if (!objs.length) return;
  const sh = sh_(n), h = head_(sh), rg = sh.getRange(sh.getLastRow() + 1, 1, objs.length, h.length);
  rg.setNumberFormat('@');
  rg.setValues(objs.map(function (o) { return h.map(function (k) { return o[k] == null ? '' : String(o[k]); }); }));
}
function upsertJawaban_(o) {
  const sh = sh_('jawaban'), h = head_(sh), L = sh.getLastRow();
  let row = 0;
  if (L > 1) {
    const v = sh.getRange(2, 1, L - 1, 2).getValues();
    for (let i = 0; i < v.length; i++) if (String(v[i][0]) === o.username && String(v[i][1]) === o.ujian_id) { row = i + 2; break; }
  }
  if (!row) row = L + 1;
  sh.getRange(row, 1, 1, h.length).setNumberFormat('@')
    .setValues([h.map(function (k) { return o[k] == null ? '' : String(o[k]); })]);
}
function log_(u, k, d) {
  try { sh_('log').appendRow([Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'), u, k, d || '']); } catch (e) {}
}
function bool_(v) { return String(v).toUpperCase() === 'TRUE'; }
function cache_() { return CacheService.getScriptCache(); }
function auth_(ses, role) {
  const v = cache_().get('s_' + ses);
  if (!v) throw new Error('Sesi berakhir. Silakan login kembali.');
  const s = JSON.parse(v);
  if (s.role !== role) throw new Error('Tidak diizinkan.');
  return s;
}
function ident_() {
  const d = { nama: 'TRY OUT', sub: '', logo: '' }, ch = [];
  rows_('identitas').forEach(function (r) {
    if (r.kunci === 'nama') d.nama = r.nilai;
    else if (r.kunci === 'sub') d.sub = r.nilai;
    else if (/^logo_\d+$/.test(r.kunci)) ch[Number(r.kunci.slice(5))] = r.nilai;
  });
  d.logo = ch.join('');
  return d;
}
function ujianAktif_(mapel) {
  const soal = rows_('soal');
  const e = rows_('ujian').filter(function (x) {
    return x.mapel === mapel && bool_(x.aktif) &&
      soal.some(function (q) { return q.mapel === x.mapel && Number(q.paket) === Number(x.paket); });
  })[0];
  return e ? { id: e.id, mapel: e.mapel, paket: Number(e.paket), menit: Number(e.menit) || 75, token: e.token } : null;
}

/* ---------- Halaman awal ---------- */
function apiPublic() {
  const m = [];
  rows_('ujian').forEach(function (e) { if (bool_(e.aktif) && m.indexOf(e.mapel) < 0) m.push(e.mapel); });
  return { ident: ident_(), mapel: m };
}

/* ---------- Login ---------- */
function apiLogin(u, pw, mapel) {
  const us = rows_('pengguna').filter(function (r) { return r.username === u; })[0];
  const cc = cache_(), fk = 'f_' + String(u).slice(0, 100), nf = Number(cc.get(fk) || 0);
  if (nf >= 5) return { err: 'Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi.' };
  if (!us || !us.sandi_hash || us.sandi_hash !== hashSandi(pw)) {
    cc.put(fk, String(nf + 1), 600);
    log_(u, 'login_gagal');
    return { err: 'Username atau password salah.' };
  }
  cc.remove(fk);
  const ses = Utilities.getUuid();
  if (us.peran === 'admin') {
    cache_().put('s_' + ses, JSON.stringify({ u: u, role: 'admin' }), SESI_DETIK);
    log_(u, 'login_admin');
    return { role: 'admin', ses: ses, user: { u: u, n: us.nama } };
  }
  if (!mapel) return { err: 'Pilih mata pelajaran terlebih dahulu.', back: 1 };
  const uj = ujianAktif_(mapel);
  if (!uj) return { err: 'Tidak ada ujian aktif untuk mata pelajaran ini.' };
  const ss = rows_('sesi').filter(function (z) { return z.ujian_id === uj.id; });
  if (ss.length) {
    const sp = rows_('sesi_peserta');
    const mine = ss.filter(function (z) { return sp.some(function (p) { return p.sesi_id === z.id && p.username === u; }); });
    if (!mine.length) return { err: 'Anda tidak terdaftar pada sesi ujian ini.' };
    const tz = Session.getScriptTimeZone(), now = Date.now();
    const T = function (z) { return Utilities.parseDate(z.tanggal + ' ' + z.jam_mulai, tz, 'yyyy-MM-dd HH:mm').getTime(); };
    if (!mine.some(function (z) { return T(z) <= now; }))
      return { err: 'Ujian belum dimulai. Jadwal: ' + mine[0].tanggal + ' pukul ' + mine[0].jam_mulai };
    const lanjut = !!cache_().get('st_' + u);
    const buka = mine.some(function (z) {
      const bm = Number(z.batas_masuk) || 0;
      return T(z) <= now && (!bm || now <= T(z) + bm * 60000);
    });
    if (!buka && !lanjut) return { err: 'Sesi ujian sudah ditutup (melewati batas masuk).' };
  }
  cache_().put('s_' + ses, JSON.stringify({ u: u, role: 'siswa', n: us.nama, e: uj.id, m: uj.mapel, p: uj.paket }), SESI_DETIK);
  log_(u, 'login_siswa', uj.mapel);
  return { role: 'siswa', ses: ses, user: { u: u, n: us.nama, g: us.jk, k: us.kelas }, ujian: { id: uj.id, paket: uj.paket, menit: uj.menit } };
}

/* ---------- Siswa ---------- */
function apiMulai(ses, token) {
  const s = auth_(ses, 'siswa');
  const uj = rows_('ujian').filter(function (e) { return e.id === s.e; })[0];
  if (!uj || !uj.token) return { err: 'Token ujian belum dirilis oleh admin. Hubungi proktor.' };
  if (String(token).trim().toUpperCase() !== String(uj.token).toUpperCase()) { log_(s.u, 'token_salah'); return { err: 'Token yang Anda masukkan salah.' }; }
  if (rows_('hasil').some(function (h) { return h.username === s.u && h.mapel === uj.mapel && Number(h.paket) === Number(uj.paket); }))
    return { err: 'Anda sudah menyelesaikan ujian ini.' };
  const sol = soalUjian_(uj), L = layout_(sol, s.u, uj);
  const qs = L.order.map(function (oi, j) {
    const q = sol[oi], o = [q.opsi_a, q.opsi_b, q.opsi_c, q.opsi_d];
    return { t: q.pertanyaan, o: L.opt[j].map(function (k) { return o[k]; }), s: q.stimulus };
  });
  const out = { qs: qs, sisa: (Number(uj.menit) || 75) * 60 };
  // lanjutkan jika ada progres tersimpan
  let d = null;
  const c = cache_().get('st_' + s.u);
  if (c) d = JSON.parse(c);
  else {
    const jw = rows_('jawaban').filter(function (r) { return r.username === s.u && r.ujian_id === uj.id; })[0];
    if (jw) { const f = JSON.parse(jw.ragu_json || '{}'); d = { ans: JSON.parse(jw.jawaban_json || '[]'), flg: f.f, cur: f.c, s: Number(jw.sisa_waktu), ts: Number(jw.terakhir_simpan) }; }
  }
  if (d && d.ans && d.ans.length === qs.length && d.st !== 'Selesai') {
    out.ans = d.ans; out.flg = d.flg; out.cur = d.cur || 0;
    out.sisa = Math.max(0, d.s - Math.floor((Date.now() - d.ts) / 1000));
  }
  log_(s.u, 'mulai_ujian', uj.mapel + ' P' + uj.paket);
  return out;
}
function apiSimpan(ses, st) {
  const s = auth_(ses, 'siswa');
  const d = { n: s.n, m: s.m, p: s.p, no: st.cur + 1, tot: st.ans.length,
    j: st.ans.filter(function (a) { return a >= 0; }).length, r: st.flg.filter(Boolean).length,
    s: st.left, st: st.st, ts: Date.now(), ans: st.ans, flg: st.flg, cur: st.cur };
  cache_().put('st_' + s.u, JSON.stringify(d), SESI_DETIK);
  if (st.flush) {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      upsertJawaban_({ username: s.u, ujian_id: s.e, jawaban_json: JSON.stringify(st.ans),
        ragu_json: JSON.stringify({ f: st.flg, c: st.cur }), sisa_waktu: st.left, terakhir_simpan: Date.now() });
    } finally { lock.releaseLock(); }
  }
  return 1;
}
function apiSelesai(ses, ans) {
  const s = auth_(ses, 'siswa');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const uj = rows_('ujian').filter(function (e) { return e.id === s.e; })[0];
    const sol = soalUjian_(uj), L = layout_(sol, s.u, uj);
    const ada = rows_('hasil').filter(function (h) { return h.username === s.u && h.mapel === uj.mapel && Number(h.paket) === Number(uj.paket); })[0];
    if (ada) return { benar: Number(ada.benar), tot: Number(ada.total), nilai: Number(ada.nilai) };
    let b = 0; const det = [];
    const id = Utilities.getUuid().slice(0, 8);
    L.order.forEach(function (oi, j) {
      const q = sol[oi], ok = L.opt[j][ans[j]] === 'ABCD'.indexOf(q.kunci);
      if (ok) b++;
      det.push({ hasil_id: id, nomor: j + 1, topik: q.topik || '-', benar: ok ? 1 : 0 });
    });
    const nilai = sol.length ? Math.round(b / sol.length * 100) : 0;
    const us = rows_('pengguna').filter(function (r) { return r.username === s.u; })[0] || {};
    append_('hasil', [{ id: id, waktu: Date.now(), username: s.u, nama: s.n, kelas: us.kelas || '-',
      mapel: uj.mapel, paket: uj.paket, benar: b, total: sol.length, nilai: nilai }]);
    append_('hasil_detail', det);
    const c = cache_().get('st_' + s.u);
    if (c) { const d = JSON.parse(c); d.st = 'Selesai'; d.ts = Date.now(); cache_().put('st_' + s.u, JSON.stringify(d), SESI_DETIK); }
    log_(s.u, 'selesai', b + '/' + sol.length);
    return { benar: b, tot: sol.length, nilai: nilai };
  } finally { lock.releaseLock(); }
}

/* ---------- Admin ---------- */
function apiAdminGet(ses) {
  auth_(ses, 'admin');
  const sp = rows_('sesi_peserta');
  return {
    ident: ident_(),
    users: rows_('pengguna').map(function (r) {
      return { u: r.username, p: r.sandi_kartu, n: r.nama, k: r.kelas, g: r.jk, role: r.peran === 'admin' ? 'admin' : undefined };
    }),
    soal: rows_('soal').map(function (r) {
      return { id: r.id, mapel: r.mapel, topik: r.topik, paket: Number(r.paket), s: r.stimulus, t: r.pertanyaan,
        o: [r.opsi_a, r.opsi_b, r.opsi_c, r.opsi_d], a: Math.max(0, 'ABCD'.indexOf(r.kunci)) };
    }),
    ujian: rows_('ujian').map(function (r) {
      return { id: r.id, mapel: r.mapel, paket: Number(r.paket), aktif: bool_(r.aktif), token: r.token, menit: Number(r.menit) || 75, acak: String(r.acak).toUpperCase() !== 'FALSE' };
    }),
    sesi: rows_('sesi').map(function (r) {
      return { id: r.id, nm: r.nama, e: r.ujian_id, tgl: r.tanggal, jam: r.jam_mulai, bm: Number(r.batas_masuk) || 0,
        ps: sp.filter(function (p) { return p.sesi_id === r.id; }).map(function (p) { return p.username; }) };
    })
  };
}
function apiAdminSave(ses, db) {
  auth_(ses, 'admin');
  if (!db.users.some(function (u) { return u.role === 'admin'; })) throw new Error('Minimal satu admin diperlukan.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const lama = {};
    rows_('pengguna').forEach(function (r) { lama[r.username] = r.sandi_hash; });
    write_('pengguna', db.users.map(function (u) {
      return { username: u.u, sandi_hash: u.p ? hashSandi(u.p) : (lama[u.u] || ''), sandi_kartu: u.p || '',
        nama: u.n, kelas: u.k || '', jk: u.g || '', peran: u.role === 'admin' ? 'admin' : 'siswa' };
    }));
    write_('soal', db.soal.map(function (q) {
      return { id: q.id, mapel: q.mapel, topik: q.topik, paket: q.paket, stimulus: q.s || '', pertanyaan: q.t,
        opsi_a: q.o[0], opsi_b: q.o[1], opsi_c: q.o[2], opsi_d: q.o[3], kunci: 'ABCD'.charAt(q.a) };
    }));
    write_('ujian', db.ujian.map(function (e) {
      return { id: e.id, mapel: e.mapel, paket: e.paket, aktif: e.aktif ? 'TRUE' : 'FALSE', token: e.token || '', menit: e.menit, acak: e.acak === false ? 'FALSE' : 'TRUE' };
    }));
    write_('sesi', db.sesi.map(function (z) { return { id: z.id, nama: z.nm, ujian_id: z.e, tanggal: z.tgl, jam_mulai: z.jam, batas_masuk: z.bm || 0 }; }));
    const sp = [];
    db.sesi.forEach(function (z) { z.ps.forEach(function (u) { sp.push({ sesi_id: z.id, username: u }); }); });
    write_('sesi_peserta', sp);
    const L = db.ident.logo || '', rows = [{ kunci: 'nama', nilai: db.ident.nama }, { kunci: 'sub', nilai: db.ident.sub || '' }];
    for (let i = 0; i * 40000 < L.length; i++) rows.push({ kunci: 'logo_' + i, nilai: L.substr(i * 40000, 40000) });
    write_('identitas', rows);
  } finally { lock.releaseLock(); }
  return 1;
}
function apiAdminExtra(ses) {
  auth_(ses, 'admin');
  const live = {}, c = cache_(), now = Date.now();
  const siswa = rows_('pengguna').filter(function (r) { return r.peran !== 'admin'; }).map(function (r) { return r.username; });
  for (let i = 0; i < siswa.length; i += 100) {
    const part = siswa.slice(i, i + 100), m = c.getAll(part.map(function (u) { return 'st_' + u; }));
    Object.keys(m).forEach(function (k) {
      const d = JSON.parse(m[k]);
      live[k.slice(3)] = { n: d.n, m: d.m, p: d.p, no: d.no, tot: d.tot, j: d.j, r: d.r, s: d.s, st: d.st, age: now - d.ts };
    });
  }
  const det = {};
  rows_('hasil_detail').forEach(function (r) { (det[r.hasil_id] = det[r.hasil_id] || []).push([r.topik, Number(r.benar)]); });
  const hasil = rows_('hasil').map(function (r) {
    return { u: r.username, n: r.nama, k: r.kelas, m: r.mapel, p: Number(r.paket), b: Number(r.benar),
      tot: Number(r.total), d: det[r.id] || [], w: Number(r.waktu) };
  });
  return { live: live, hasil: hasil };
}

/** Reset peserta: hapus progres dan hasil agar siswa dapat mengulang ujian yang sama. */
function apiReset(ses, u, m, p) {
  auth_(ses, 'admin');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    cache_().remove('st_' + u);
    write_('jawaban', rows_('jawaban').filter(function (r) { return r.username !== u; }));
    const hapus = {}, hs = rows_('hasil');
    hs.forEach(function (h) { if (h.username === u && h.mapel === m && Number(h.paket) === Number(p)) hapus[h.id] = 1; });
    write_('hasil', hs.filter(function (h) { return !hapus[h.id]; }));
    write_('hasil_detail', rows_('hasil_detail').filter(function (d) { return !hapus[d.hasil_id]; }));
    log_(u, 'reset_oleh_admin', m + ' P' + p);
  } finally { lock.releaseLock(); }
  return 1;
}

/* ---------- Pengacakan soal dan opsi per siswa (deterministik) ---------- */
function soalUjian_(uj) {
  return rows_('soal').filter(function (q) { return q.mapel === uj.mapel && Number(q.paket) === Number(uj.paket); });
}
function hashSeed_(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function rng_(str) {
  let a = hashSeed_(str)();
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuf_(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
/** order[j] = indeks soal asli pada posisi j; opt[j] = urutan opsi asli pada posisi j.
 *  Hasilnya selalu sama untuk siswa dan ujian yang sama, sehingga tidak perlu disimpan.
 *  Soal dengan teks bacaan yang sama tetap berurutan dalam satu kelompok. */
function layout_(sol, u, uj) {
  const n = sol.length, idn = [];
  for (let i = 0; i < n; i++) idn.push(i);
  if (String(uj.acak).toUpperCase() === 'FALSE') return { order: idn, opt: idn.map(function () { return [0, 1, 2, 3]; }) };
  const rnd = rng_(u + '|' + uj.id + '|' + (PropertiesService.getScriptProperties().getProperty('GARAM') || ''));
  const G = [], ix = {};
  sol.forEach(function (q, i) {
    const k = q.stimulus ? 's' + q.stimulus : 'q' + i;
    if (ix[k] == null) { ix[k] = G.length; G.push([]); }
    G[ix[k]].push(i);
  });
  const order = [].concat.apply([], shuf_(G, rnd));
  return { order: order, opt: order.map(function () { return shuf_([0, 1, 2, 3], rnd); }) };
}

/* ---------- Ekspor hasil ke Google Sheets (bisa diunduh sebagai Excel atau PDF) ---------- */
function apiExportHasil(ses, f) {
  auth_(ses, 'admin');
  f = f || {};
  const det = {};
  rows_('hasil_detail').forEach(function (r) { (det[r.hasil_id] = det[r.hasil_id] || []).push([r.topik, Number(r.benar)]); });
  const data = [];
  rows_('hasil').forEach(function (h) {
    if (f.m && h.mapel !== f.m) return;
    let d = det[h.id] || [];
    if (f.t) d = d.filter(function (x) { return x[0] === f.t; });
    if (!d.length) return;
    const b = d.reduce(function (a, x) { return a + x[1]; }, 0);
    data.push([h.username, h.nama, h.kelas, h.mapel, Number(h.paket), b, d.length - b, Math.round(b / d.length * 100)]);
  });
  data.sort(function (a, b) { return String(a[2]).localeCompare(String(b[2])) || String(a[1]).localeCompare(String(b[1])); });
  const rows = data.map(function (r, i) { return [i + 1].concat(r); });
  const tz = Session.getScriptTimeZone();
  const ss = SpreadsheetApp.create('Rekap Hasil ' + (f.m || 'Semua') + (f.t ? ' - ' + f.t : '') + ' ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HHmm'));
  const sh = ss.getSheets()[0];
  sh.setName('Rekap');
  const head = ['No', 'Username', 'Nama', 'Kelas', 'Mapel', 'Paket', 'Benar', 'Salah', 'Nilai'];
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#336699').setFontColor('#ffffff');
  if (rows.length) {
    sh.getRange(2, 2, rows.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, rows.length, head.length).setValues(rows);
    const avg = rows.reduce(function (a, r) { return a + r[8]; }, 0) / rows.length;
    sh.getRange(rows.length + 3, 1).setValue('Rata-rata nilai');
    sh.getRange(rows.length + 3, 9).setValue(Math.round(avg * 10) / 10);
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, head.length);
  return { url: ss.getUrl(), n: rows.length };
}

/* ---------- Alat bantu diagnosa (jalankan dari editor Apps Script) ---------- */
/** Memeriksa sheet, akun admin, dan zona waktu. Lihat hasilnya di View > Logs / Execution log. */
function cekSistem() {
  const ss = getSS_(), baris = [];
  Object.keys(SKEMA).forEach(function (n) { baris.push(n + ': ' + (ss.getSheetByName(n) ? 'ada' : 'TIDAK ADA')); });
  if (ss.getSheetByName('pengguna')) {
    const adm = rows_('pengguna').filter(function (r) { return r.peran === 'admin'; });
    baris.push('Jumlah admin: ' + adm.length);
    if (adm.length) baris.push('Sandi admin "' + adm[0].username + '" = admin123 ? ' + (adm[0].sandi_hash === hashSandi('admin123')));
  }
  baris.push('Zona waktu: ' + Session.getScriptTimeZone());
  Logger.log(baris.join('\n'));
  return baris.join('\n');
}
/** Memulihkan akun admin: username "admin", kata sandi "admin123". */
function resetAdmin() {
  const L = rows_('pengguna');
  let ada = false;
  L.forEach(function (r) {
    if (r.username === 'admin') { r.sandi_hash = hashSandi('admin123'); r.sandi_kartu = ''; r.peran = 'admin'; ada = true; }
  });
  if (!ada) L.push({ username: 'admin', sandi_hash: hashSandi('admin123'), sandi_kartu: '', nama: 'Administrator', kelas: '', jk: '', peran: 'admin' });
  write_('pengguna', L);
  Logger.log('Akun admin dipulihkan: admin / admin123');
}

