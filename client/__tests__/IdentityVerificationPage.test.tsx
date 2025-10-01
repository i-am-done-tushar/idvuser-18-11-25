// client/__tests__/IdentityVerificationPage.test.tsx
import React from 'react';
import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ✅ Adjust this import if your path differs
import { IdentityVerificationPage } from '../components/IdentityVerificationPage';

// ---------- spies that mocks will close over ----------
const toastSpy = vi.fn();
const navigateSpy = vi.fn();

// ---------- MOCKS (adjust module ids if your paths differ) ----------
// If your component imports "./Header", "./StepSidebar", etc, and your test is
// at client/__tests__, then "../components/Header" should resolve to the same file.
// If not, tweak these to match your project tree.
// Before tests run (e.g., in beforeEach or right after imports)
(global as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
  // Template version
  if (url.includes('/api/TemplateVersion/')) {
    return new Response(JSON.stringify({
      versionId: 42,
      sections: [
        { id: 11, orderIndex: 1, isActive: true, sectionType: 'personalInformation',
          fieldMappings: [{ structure: { personalInfo: {
            firstName: true, lastName: true, middleName: true,
            dateOfBirth: true, email: true, phoneNumber: true,
            gender: true, currentAddress: true, permanentAddress: true,
          }}}]
        },
        { id: 22, orderIndex: 2, isActive: true, sectionType: 'documents' },
        { id: 33, orderIndex: 3, isActive: true, sectionType: 'biometrics' },
      ],
    }), { status: 200 });
  }

  // UserTemplateSubmissions check (GET) → no existing
  if (url.includes('/api/UserTemplateSubmissions?') && (!init || init.method === 'GET')) {
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  }

  // Create UserTemplateSubmission (POST)
  if (url.endsWith('/api/UserTemplateSubmissions') && init?.method === 'POST') {
    return new Response(JSON.stringify({ id: 777 }), { status: 200 });
  }

  // Email OTP generate
  if (url.endsWith('/api/Otp/generate') && init?.method === 'POST') {
    return new Response('{}', { status: 200 });
  }

  // Phone OTP start/verify (optional for other tests)
  if (url.endsWith('/api/Otp/phone/start') && init?.method === 'POST') {
    return new Response(JSON.stringify({ success: true, otpId: 9999, expiresAt: new Date().toISOString() }), { status: 200 });
  }
  if (url.endsWith('/api/Otp/phone/verify') && init?.method === 'POST') {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  // Section POSTs
  if (/\/api\/\d+\/(11|22|33)$/.test(url) && init?.method === 'POST') {
    return new Response('{}', { status: 200 });
  }

  return new Response('{}', { status: 200 });
});

// Header: simple stub
vi.mock('../components/Header', () => ({
  Header: ({ onMobileMenuToggle }: any) => (
    <div data-testid="header">
      <button onClick={onMobileMenuToggle}>toggle-menu</button>
    </div>
  ),
}));

// StepSidebar: expose currentStep so we can assert
vi.mock('../components/StepSidebar', () => ({
  StepSidebar: ({ currentStep }: any) => (
    <div data-testid="sidebar">currentStep: {String(currentStep)}</div>
  ),
}));

// ConsentDialog: show accept/close buttons wired to props
vi.mock('../components/ConsentDialog', () => ({
  ConsentDialog: ({ isOpen, onAgree, onClose }: any) =>
    isOpen ? (
      <div data-testid="consent-dialog">
        <button onClick={onAgree}>agree</button>
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}));

// HowItWorksDialog: trivial (we don't use it in tests)
vi.mock('../components/HowItWorksDialog', () => ({
  HowItWorksDialog: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="how-it-works">
        <button onClick={onClose}>hide-how</button>
      </div>
    ) : null,
}));

// OTP dialog: render a flag when open
vi.mock('../components/OTPVerificationDialog', () => ({
  OTPVerificationDialog: ({ isOpen, type, onVerify, onResend, onClose }: any) =>
    isOpen ? (
      <div data-testid="otp-dialog">
        <div>otp-type: {type}</div>
        <button onClick={() => onVerify('123456')}>verify-otp</button>
        <button onClick={onResend}>resend-otp</button>
        <button onClick={onClose}>close-otp</button>
      </div>
    ) : null,
}));

// DynamicSection + DesktopDynamicSection:
// - If sectionType === personalInformation: provide "fill-valid-personal" and "send-email-otp" buttons
// - If documents: "complete-docs"
// - If biometrics: "complete-selfie"
function MockSection({
  section,
  setFormData,
  onSendEmailOTP,
  onSendPhoneOTP,
  onIdentityDocumentComplete,
  onSelfieComplete,
}: any) {
  const t = section.sectionType;
  return (
    <div data-testid={`section-${t}`}>
      {t === 'personalInformation' && (
        <>
          <button
            onClick={() =>
              setFormData({
                firstName: 'John',
                lastName: 'Doe',
                middleName: '',
                dateOfBirth: '1990-01-01',
                email: 'john@example.com',
                countryCode: '+1',
                phoneNumber: '4155550000',
                gender: 'M',
                address: '1 Main St',
                city: 'SF',
                postalCode: '94105',
                permanentAddress: '1 Main St',
                permanentCity: 'SF',
                permanentPostalCode: '94105',
              })
            }
          >
            fill-valid-personal
          </button>
          <button onClick={onSendEmailOTP}>send-email-otp</button>
          <button onClick={() => onSendPhoneOTP?.()}>send-phone-otp</button>
        </>
      )}
      {t === 'documents' && (
        <button onClick={() => onIdentityDocumentComplete?.()}>complete-docs</button>
      )}
      {t === 'biometrics' && (
        <button onClick={() => onSelfieComplete?.()}>complete-selfie</button>
      )}
    </div>
  );
}

vi.mock('../components/DynamicSection', () => ({
  DynamicSection: MockSection,
}));
vi.mock('../components/DesktopDynamicSection', () => ({
  DesktopDynamicSection: MockSection,
}));

// useToast: capture all toasts
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// useNavigate: spy
vi.mock('react-router-dom', async (orig) => {


  const actual = await orig();
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});
// --- add near the other vi.mock(...) calls ---

// Auto-accept consent so the page isn't dimmed/blocked
vi.mock('./ConsentDialog', () => ({
  ConsentDialog: ({ isOpen, onAgree }: any) =>
    isOpen ? (
      <div data-testid="consent-dialog">
        <button onClick={onAgree}>agree</button>
      </div>
    ) : null,
}));

// Minimal OTP dialog that renders when isOpen = true
vi.mock('./OTPVerificationDialog', () => ({
  OTPVerificationDialog: ({
    isOpen,
    type,
    onVerify,
    onResend,
    onClose,
    recipientEmail,
    recipientPhone,
  }: any) =>
    isOpen ? (
      <div data-testid="otp-dialog">
        <div>otp-type: {type}</div>
        {recipientEmail && <div>email: {recipientEmail}</div>}
        {recipientPhone && <div>phone: {recipientPhone}</div>}
        <button onClick={() => onVerify('123456')}>verify-otp</button>
        <button onClick={() => onResend?.()}>resend-otp</button>
        <button onClick={() => onClose?.()}>close-otp</button>
      </div>
    ) : null,
}));

// Keep a tiny header/sidebar mock so we can read currentStep
vi.mock('./Header', () => ({
  Header: ({ onMobileMenuToggle, isMobileMenuOpen }: any) => (
    <div data-testid="header">
      <button onClick={onMobileMenuToggle}>toggle-menu</button>
      {isMobileMenuOpen ? <span>open</span> : null}
    </div>
  ),
}));

vi.mock('./StepSidebar', () => ({
  StepSidebar: ({ currentStep }: any) => (
    <div data-testid="sidebar">currentStep:{'\n'}{currentStep}</div>
  ),
}));

// DynamicSection/DesktopDynamicSection test helpers (buttons we click in tests)
vi.mock('./DynamicSection', () => ({
  DynamicSection: (props: any) => (
    <div data-testid={`section-${props.section.sectionType}`}>
      <button onClick={() => {
        // Fill valid personal info to satisfy validators
        props.setFormData({
          firstName: 'John',
          lastName: 'Doe',
          middleName: '',
          dateOfBirth: '1990-01-01',
          email: 'j@d.com',
          countryCode: '+1',
          phoneNumber: '4155550000',
          gender: 'M',
          address: '123 Main',
          city: 'SF',
          postalCode: '94105',
          permanentAddress: '123 Main',
          permanentCity: 'SF',
          permanentPostalCode: '94105',
        });
      }}>fill-valid-personal</button>
      <button onClick={() => props.onSendEmailOTP?.()}>send-email-otp</button>
      <button onClick={() => props.onSendPhoneOTP?.()}>send-phone-otp</button>
      <button onClick={() => props.onIdentityDocumentComplete?.()}>complete-docs</button>
      <button onClick={() => props.onSelfieComplete?.()}>complete-selfie</button>
    </div>
  ),
}));

vi.mock('./DesktopDynamicSection', () => ({
  DesktopDynamicSection: (props: any) => (
    <div data-testid={`section-${props.section.sectionType}`}>
      <button onClick={() => {
        props.setFormData({
          firstName: 'John',
          lastName: 'Doe',
          middleName: '',
          dateOfBirth: '1990-01-01',
          email: 'j@d.com',
          countryCode: '+1',
          phoneNumber: '4155550000',
          gender: 'M',
          address: '123 Main',
          city: 'SF',
          postalCode: '94105',
          permanentAddress: '123 Main',
          permanentCity: 'SF',
          permanentPostalCode: '94105',
        });
      }}>fill-valid-personal</button>
      <button onClick={() => props.onSendEmailOTP?.()}>send-email-otp</button>
      <button onClick={() => props.onSendPhoneOTP?.()}>send-phone-otp</button>
      <button onClick={() => props.onIdentityDocumentComplete?.()}>complete-docs</button>
      <button onClick={() => props.onSelfieComplete?.()}>complete-selfie</button>
    </div>
  ),
}));


// ---------- helpers ----------
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_API_URL ||
  '';

const TEMPLATE_ID = 777;
const USER_ID = 55;

// Minimal TemplateVersionResponse that your page expects
const templateVersionPayload = {
  versionId: TEMPLATE_ID,
  sections: [
    {
      id: 11,
      orderIndex: 1,
      isActive: true,
      sectionType: 'personalInformation',
      fieldMappings: [
        {
          structure: {
            personalInfo: {
              firstName: true,
              lastName: true,
              middleName: true,
              dateOfBirth: true,
              email: true,
              phoneNumber: true,
              gender: true,
              currentAddress: true,
              permanentAddress: true,
            },
          },
        },
      ],
    },
    {
      id: 22,
      orderIndex: 2,
      isActive: true,
      sectionType: 'documents',
      fieldMappings: [],
    },
    {
      id: 33,
      orderIndex: 3,
      isActive: true,
      sectionType: 'biometrics',
      fieldMappings: [],
    },
  ],
};

// Small helpers to return fetch-like responses
const okJson = (obj: any) => ({
  ok: true,
  status: 200,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
});
const okText = (txt = '') => ({
  ok: true,
  status: 200,
  json: async () => (txt ? JSON.parse(txt) : {}),
  text: async () => txt,
});
const notOkText = (status = 400, txt = 'error') => ({
  ok: false,
  status,
  json: async () => ({ message: txt }),
  text: async () => txt,
});
// Helps React flush updates after advancing timers
const tick = () => new Promise((r) => setTimeout(r, 0));

// Use async timer advance so promises created by timers can settle
const advance1500 = async () => {
  await vi.advanceTimersByTimeAsync(1600);
  await tick();
};

// Sidebar text helper
const expectCurrentStep = (n: number) => {
  const el = screen.getByTestId('sidebar');
  expect(el).toHaveTextContent(String(n));
};
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function merge(actual: unknown, extra: Record<string, unknown>) {
  if (!isRecord(actual)) throw new Error('Expected object');
  return { ...actual, ...extra };
}

// A route-able fetch mock builder for each test
function buildFetchMock(opts: {
  hasExistingSubmission?: boolean;
  newSubmissionId?: number;
  phoneOtpStart?: { success?: boolean; otpId?: number; expiresAt?: string };
  phoneOtpVerifyOk?: boolean;
}) {
  const {
    hasExistingSubmission = true,
    newSubmissionId = 999,
    phoneOtpStart = { success: true, otpId: 444, expiresAt: new Date().toISOString() },
    phoneOtpVerifyOk = true,
  } = opts;

  return vi.fn(async (url: string, init?: RequestInit) => {
    // TemplateVersion GET
    if (typeof url === 'string' && url.endsWith(`/api/TemplateVersion/${TEMPLATE_ID}`)) {
      return okJson(templateVersionPayload) as any;
    }

    // Check existing submission
    if (
      typeof url === 'string' &&
      url.startsWith(`${API_BASE}/api/UserTemplateSubmissions?TemplateVersionId=${TEMPLATE_ID}`)
    ) {
      if (hasExistingSubmission) {
        return okJson({ items: [{ id: 123 }] }) as any;
      }
      return okJson({ items: [] }) as any;
    }

    // Create submission
    if (typeof url === 'string' && url.endsWith('/api/UserTemplateSubmissions') && init?.method === 'POST') {
      return okJson({ id: newSubmissionId }) as any;
    }

    // Email OTP: generate
    if (typeof url === 'string' && url.endsWith('/api/Otp/generate') && init?.method === 'POST') {
      return okText('') as any;
    }

    // Email OTP: validate
    if (typeof url === 'string' && url.endsWith('/api/Otp/validate') && init?.method === 'POST') {
      return okText('') as any;
    }

    // Phone OTP: start
    if (typeof url === 'string' && url.endsWith('/api/Otp/phone/start') && init?.method === 'POST') {
      if (phoneOtpStart.success === false) {
        return okJson({ success: false }) as any;
      }
      return okJson({ success: true, otpId: phoneOtpStart.otpId ?? 444, expiresAt: phoneOtpStart.expiresAt }) as any;
    }

    // Phone OTP: verify
    if (typeof url === 'string' && url.endsWith('/api/Otp/phone/verify') && init?.method === 'POST') {
      if (phoneOtpVerifyOk) {
        return okText(JSON.stringify({ success: true })) as any;
      }
      return notOkText(400, 'invalid') as any;
    }

    // Section submissions: POST /api/{submissionId}/{sectionId}
    const sectionPost = url.match(/\/api\/(\d+)\/(\d+)$/);
    if (sectionPost && init?.method === 'POST') {
      return okText('') as any;
    }

    // Default
    return okJson({}) as any;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  // default: there IS an existing submission (id: 123)
  global.fetch = buildFetchMock({ hasExistingSubmission: true });
  toastSpy.mockClear();
  navigateSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- small helpers for interactions ----------
async function loadPage() {
  render(<IdentityVerificationPage templateId={TEMPLATE_ID} userId={USER_ID} />);
  // initial "Loading..." disappears when template is fetched
  await screen.findByText(/Identity Verification Form/i);
  // consent dialog visible initially -> accept
  const consent = await screen.findByTestId('consent-dialog');
  await userEvent.click(within(consent).getByText('agree'));
  await waitFor(() => expect(screen.queryByTestId('consent-dialog')).not.toBeInTheDocument());
}

// ================================================================
//                            TESTS
// ================================================================
describe('IdentityVerificationPage', () => {
  it('loads template, shows consent, and sets submissionId from existing submission', async () => {
    await loadPage();
    // After load, with existing submission mocked, the app should render sidebars showing step 1
    expectCurrentStep(1);
    // Ensure the mocked fetch checked for existing submissions
    const calls = (global.fetch as any).mock.calls.map((c: any) => c[0]);
    expect(calls.some((u: string) => String(u).includes('/api/UserTemplateSubmissions?'))).toBe(true);
  });

  it('creates a new submission when none exists', async () => {
    global.fetch = buildFetchMock({ hasExistingSubmission: false, newSubmissionId: 987 });
    await loadPage();

    const calls = (global.fetch as any).mock.calls.map((c: any) => [c[0], c[1]?.method ?? 'GET']);
    // should have POST /api/UserTemplateSubmissions after empty GET
    expect(
      calls.some(
        ([u, m]: any) => String(u).endsWith('/api/UserTemplateSubmissions') && m === 'POST'
      )
    ).toBe(true);
  });


it('opens OTP dialog when sending email OTP', async () => {
  await loadPage();

  const personals = screen.getAllByTestId('section-personalInformation');
  // must have a valid email first
  await userEvent.click(within(personals[0]).getByText('fill-valid-personal'));

  await userEvent.click(within(personals[0]).getByText('send-email-otp'));

  // dialog should render from our mock
  expect(await screen.findByTestId('otp-dialog')).toBeInTheDocument();

  // and the /api/Otp/generate endpoint should have been called
  const called = (global.fetch as any).mock.calls.some((c: any[]) =>
    String(c[0]).endsWith('/api/Otp/generate')
  );
  expect(called).toBe(true);
});


it('starts and verifies phone OTP via backend', async () => {
  // rewire fetch to ensure phone OTP endpoints are happy
  global.fetch = buildFetchMock({
    hasExistingSubmission: true,
    phoneOtpStart: { success: true, otpId: 9991, expiresAt: new Date().toISOString() },
    phoneOtpVerifyOk: true,
  });

  await loadPage();

  // MUST fill personal info so phone validation passes
  const personal = screen.getAllByTestId('section-personalInformation')[0];
  await userEvent.click(within(personal).getByText('fill-valid-personal'));

  // Trigger phone OTP
  await userEvent.click(within(personal).getByText('send-phone-otp'));

  // Now the dialog appears
  const dlg = await screen.findByTestId('otp-dialog');
  expect(within(dlg).getByText(/otp-type:\s*phone/i)).toBeInTheDocument();

  // Verify code via mock button
  await userEvent.click(within(dlg).getByText('verify-otp'));

  await waitFor(() =>
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Phone verified' })
    )
  );
});

});
