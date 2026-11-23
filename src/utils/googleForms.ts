import {
  clearCachedGoogleToken,
  getGoogleWorkspaceToken,
  initGoogleWorkspaceAuth,
  signInGoogleWorkspace,
  signOutGoogleWorkspace,
} from './googleWorkspace';

export const initGoogleFormsAuth = initGoogleWorkspaceAuth;
export const signInGoogleForms = signInGoogleWorkspace;
export const signOutGoogleForms = signOutGoogleWorkspace;
export const getGoogleFormsToken = getGoogleWorkspaceToken;

export function extractFormIdFromInput(raw: string): { formId: string | null; error?: string } {
  const input = raw.trim();
  if (!input) {
    return { formId: null, error: 'Masukkan tautan atau ID Google Formulir.' };
  }

  if (/forms\.gle\//i.test(input)) {
    return {
      formId: null,
      error:
        'Tautan pendek forms.gle tidak memuat ID dokumen. Buka formulir di mode editor lalu salin URL (/forms/d/<ID>/edit).',
    };
  }

  if (/\/forms\/d\/e\//i.test(input)) {
    return {
      formId: null,
      error:
        'Tautan ini adalah tautan responden (/d/e/...). Salin tautan editor Google Formulir (/forms/d/<ID>/edit) atau ID dokumennya.',
    };
  }

  const urlMatch = input.match(/\/forms\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{10,})/);
  if (urlMatch) {
    return { formId: urlMatch[1] };
  }

  if (/^[a-zA-Z0-9_-]{15,}$/.test(input)) {
    return { formId: input };
  }

  return {
    formId: null,
    error: 'Format tautan atau ID Google Formulir tidak dikenali.',
  };
}

export interface ImportedGoogleFormQuestion {
  sourceId: string;
  selected: boolean;
  s: string;
  t: string;
  o: [string, string, string, string];
  a: number; // -1 if no grading key found in Form
  hasKeyFromForm: boolean;
}

export interface GoogleFormImportPreview {
  formId: string;
  title: string;
  questions: ImportedGoogleFormQuestion[];
  skipped: Array<{ title: string; reason: string }>;
}

interface GoogleFormApiResponse {
  formId?: string;
  info?: {
    title?: string;
    description?: string;
  };
  items?: Array<{
    itemId?: string;
    title?: string;
    description?: string;
    textItem?: Record<string, unknown>;
    pageBreakItem?: Record<string, unknown>;
    questionItem?: {
      question?: {
        questionId?: string;
        choiceQuestion?: {
          type?: string;
          options?: Array<{ value?: string; isOther?: boolean }>;
        };
        grading?: {
          correctAnswers?: {
            answers?: Array<{ value?: string }>;
          };
        };
      };
    };
    questionGroupItem?: Record<string, unknown>;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function fetchAndParseGoogleForm(
  rawInput: string,
  includeStimulus: boolean,
): Promise<GoogleFormImportPreview> {
  const token = getGoogleWorkspaceToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }

  const parsedInput = extractFormIdFromInput(rawInput);
  if (!parsedInput.formId) {
    throw new Error(parsedInput.error || 'ID Google Formulir tidak valid.');
  }

  const safeFormId = encodeURIComponent(parsedInput.formId.trim());
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearCachedGoogleToken();
    throw new Error('AUTH_REQUIRED');
  }

  const data = (await res.json().catch(() => ({}))) as GoogleFormApiResponse;

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        'Akun Google ini tidak memiliki izin akses baca ke formulir tersebut. Pastikan formulir dimiliki atau dibagikan ke akun Google Anda.',
      );
    }
    if (res.status === 404) {
      throw new Error('Google Formulir tidak ditemukan. Periksa kembali URL atau ID formulir.');
    }
    throw new Error(data.error?.message || `Gagal membaca Google Formulir (${res.status}).`);
  }

  const questions: ImportedGoogleFormQuestion[] = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  let activeStimulus = '';

  for (const item of data.items || []) {
    if (item.pageBreakItem || item.textItem) {
      const heading = (item.title || '').trim();
      const body = (item.description || '').trim();
      if (body.length >= 30) {
        activeStimulus = heading ? `${heading}\n\n${body}` : body;
      } else if (item.pageBreakItem && !body) {
        activeStimulus = '';
      }
      continue;
    }

    if (item.questionGroupItem) {
      skipped.push({
        title: (item.title || 'Grup Soal').slice(0, 60),
        reason: 'Format kisi/grup tidak didukung (gunakan Pilihan Ganda 4 opsi).',
      });
      continue;
    }

    const q = item.questionItem?.question;
    if (!q) continue;

    const itemTitle = (item.title || '').trim();
    const itemDesc = (item.description || '').trim();

    if (!q.choiceQuestion) {
      skipped.push({
        title: itemTitle.slice(0, 60) || 'Pertanyaan',
        reason: 'Bukan soal pilihan ganda.',
      });
      continue;
    }

    const validOptions = (q.choiceQuestion.options || [])
      .filter((opt) => !opt.isOther && typeof opt.value === 'string' && opt.value.trim().length > 0)
      .map((opt) => (opt.value || '').trim());

    if (validOptions.length !== 4) {
      skipped.push({
        title: itemTitle.slice(0, 60) || 'Pertanyaan Pilihan Ganda',
        reason: `Memiliki ${validOptions.length} opsi (sistem CBT mendukung tepat 4 opsi A–D).`,
      });
      continue;
    }

    if (!itemTitle) {
      skipped.push({
        title: '(Tanpa teks pertanyaan)',
        reason: 'Judul pertanyaan kosong.',
      });
      continue;
    }

    const correctValue = q.grading?.correctAnswers?.answers?.[0]?.value?.trim() || '';
    let keyIdx = -1;
    if (correctValue) {
      keyIdx = validOptions.findIndex((o) => o === correctValue);
      if (keyIdx < 0) {
        keyIdx = validOptions.findIndex((o) => o.toLowerCase() === correctValue.toLowerCase());
      }
    }

    const stimulusText = includeStimulus ? itemDesc || activeStimulus : '';

    questions.push({
      sourceId: q.questionId || item.itemId || `${questions.length + 1}`,
      selected: true,
      s: stimulusText,
      t: itemTitle,
      o: validOptions as [string, string, string, string],
      a: keyIdx,
      hasKeyFromForm: keyIdx >= 0,
    });
  }

  return {
    formId: parsedInput.formId,
    title: data.info?.title || 'Google Formulir',
    questions,
    skipped,
  };
}
