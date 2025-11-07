// client/__tests__/IdentityDocumentForm.test.tsx
import React from 'react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ✅ Adjust these 3 paths if your tree is different
import { IdentityDocumentForm } from '../components/IdentityDocumentForm';
vi.mock('../components/UploadDialog', () => {
  return {
    // A tiny, controllable stand-in that just calls onSubmit with two fake Files
    UploadDialog: ({ isOpen, onSubmit }: any) => {
      if (!isOpen) return null;
      return (
        <div data-testid="upload-dialog">
          <button
            data-testid="upload-submit"
            onClick={() =>
              onSubmit(
                new File(['front'], 'front.jpg', { type: 'image/jpeg' }),
                new File(['back'], 'back.jpg', { type: 'image/jpeg' })
              )
            }
          >
            upload-submit
          </button>
        </div>
      );
    },
  };
});
vi.mock('../components/CameraDialog', () => {
  return { CameraDialog: () => null };
});

// Your code imports this via "@/lib/document-definitions"
import { getDocumentDefinitionId } from '@/lib/document-definitions';
vi.mock('@/lib/document-definitions', () => ({
  getDocumentDefinitionId: vi.fn(() => 'DOC-123'),
}));

// ---- shared test data
const documentConfig = {
  supportedCountries: [
    { countryName: 'USA', documents: ['Passport', 'Driver License'] },
  ],
  allowUploadFromDevice: true,
  allowCaptureWebcam: true, // mocked anyway
};

const apiBase =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_API_URL ||
  '';

// ---- fetch mock
const makeOkJson = (obj: any) => ({
  ok: true,
  json: async () => obj,
});
const uploadOkPayload = { file: { id: 99 } };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();

  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    // IdentityDocumentForm always POSTs to /api/Files/upload
    if (typeof url === 'string' && url.endsWith('/api/Files/upload') && init?.method === 'POST') {
      return makeOkJson(uploadOkPayload) as any;
    }
    return makeOkJson({}) as any;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function pickUSA() {
  return userEvent.selectOptions(screen.getByRole('combobox'), 'USA');
}
function clickDoc(name: string) {
  return userEvent.click(screen.getByText(name));
}
function openUploadDialog() {
  return userEvent.click(screen.getByText('Upload Files'));
}
async function submitMockUpload() {
  const dlg = await screen.findByTestId('upload-dialog');
  await userEvent.click(within(dlg).getByTestId('upload-submit'));
}

describe('IdentityDocumentForm (with mocked UploadDialog & CameraDialog)', () => {
  it('renders and lets me choose country + document', async () => {
    render(<IdentityDocumentForm documentConfig={documentConfig} submissionId={42} />);
    await pickUSA();
    await clickDoc('Passport');
    // upload options visible
    expect(screen.getByText('Choose a method to upload your document')).toBeInTheDocument();
    // both mocked options visible
    expect(screen.getByText('Upload Files')).toBeInTheDocument();
    expect(screen.getByText('Camera')).toBeInTheDocument(); // even though CameraDialog is mocked out
  });

  it('passes correct (country, documentName) to getDocumentDefinitionId when uploading', async () => {
    render(<IdentityDocumentForm documentConfig={documentConfig} submissionId={42} />);
    await pickUSA();
    await clickDoc('Passport');
    await openUploadDialog();
    await submitMockUpload();

    // buildFormData -> getDocumentDefinitionId(country, selectedDocumentName)
    expect(getDocumentDefinitionId).toHaveBeenCalledTimes(2); // front & back
    expect(getDocumentDefinitionId).toHaveBeenCalledWith('USA', 'Passport');
  });

  it('POSTs to /api/Files/upload and creates a file card', async () => {
    render(<IdentityDocumentForm documentConfig={documentConfig} submissionId={42} />);
    await pickUSA();
    await clickDoc('Passport');

    await openUploadDialog();
    await submitMockUpload();

    // 2 uploads (front + back)
    expect(global.fetch).toHaveBeenCalledTimes(2);
    for (const call of (global.fetch as any).mock.calls) {
      expect(call[0]).toContain('/api/Files/upload');
      expect(call[1]?.method).toBe('POST');
      // FormData presence sanity-check
      const body = call[1]?.body as FormData;
      expect(body.get('UserTemplateSubmissionId')).toBe('42');
      expect(body.get('DocumentDefinitionId')).toBe('DOC-123'); // from mocked getDocumentDefinitionId
    }

    // File card shows up (component uses "<docId>.pdf"; Passport -> "passport.pdf")
    expect(await screen.findByText(/passport\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText('Files Uploaded')).toBeInTheDocument();
  });

  it('removing uploaded file also hides its card when it was the last one', async () => {
    render(<IdentityDocumentForm documentConfig={documentConfig} submissionId={42} />);
    await pickUSA();
    await clickDoc('Passport');

    await openUploadDialog();
    await submitMockUpload();

    // Find the file name first
    const fileName = await screen.findByText(/passport\.pdf/i);

    // Walk up to a parent that has the card’s remove button, then click it.
    // (The markup doesn’t expose an aria-label/role name for the X, so we scope-search.)
    let parent: HTMLElement | null = fileName;
    let removeBtn: HTMLButtonElement | null = null;
    while (parent && !removeBtn) {
      removeBtn = parent.querySelector('button') as HTMLButtonElement | null;
      parent = parent.parentElement;
    }
    expect(removeBtn).not.toBeNull();
    await userEvent.click(removeBtn!);

    // File card should disappear
    expect(screen.queryByText(/passport\.pdf/i)).not.toBeInTheDocument();
  });

  it('calls onComplete when all required documents for a country are uploaded', async () => {
    // Make a config that requires only one document → completion after first upload
    const singleDocConfig = {
      ...documentConfig,
      supportedCountries: [{ countryName: 'USA', documents: ['Passport'] }],
    };
    const onComplete = vi.fn();

    render(
      <IdentityDocumentForm
        documentConfig={singleDocConfig}
        submissionId={7}
        onComplete={onComplete}
      />
    );

    await pickUSA();
    await clickDoc('Passport');
    await openUploadDialog();
    await submitMockUpload();

    // onComplete should be called once after upload
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
