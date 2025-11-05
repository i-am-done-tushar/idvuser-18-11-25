import { useState, useEffect } from 'react';

interface ConsentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAgree: () => void;
}

export function ConsentDialog({ isOpen, onClose, onAgree }: ConsentDialogProps) {
  const [consents, setConsents] = useState({
    shareDetails: false,
    allowVerification: false,
    dataStorage: false,
    privacyPolicy: false,
  });

  const [agreeToAll, setAgreeToAll] = useState(false);

  const handleConsentChange = (key: keyof typeof consents, value: boolean) => {
    const newConsents = { ...consents, [key]: value };
    setConsents(newConsents);

    // Update "agree to all" based on individual consents
    const allChecked = Object.values(newConsents).every(Boolean);
    setAgreeToAll(allChecked);
  };

  const handleAgreeToAll = (checked: boolean) => {
    setAgreeToAll(checked);
    setConsents({
      shareDetails: checked,
      allowVerification: checked,
      dataStorage: checked,
      privacyPolicy: checked,
    });
  };

  const canAgree = Object.values(consents).every(Boolean);

  const handleAgree = () => {
    if (canAgree) {
      onAgree();
    }
  };

  // 🔒 Lock background scroll while open
  useEffect(() => {
    if (!isOpen) return;

    const body = document.body;
    const html = document.documentElement;

    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;

    // Calculate scrollbar width to prevent layout shift when locking scroll
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    body.style.overflow = "hidden";

    // Prevent mobile touch scrolling
    const preventTouch = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", preventTouch, { passive: false });

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
      document.removeEventListener("touchmove", preventTouch as any);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" // ⬅️ more opaque backdrop
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <div className="flex w-full max-w-[800px] mx-4 flex-col items-center gap-6 rounded-lg bg-background shadow-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex h-[52px] py-2.5 px-5 justify-center items-center self-stretch rounded-t border-b border-border bg-background">
          <div id="consent-title" className="text-text-primary font-figtree text-lg font-bold leading-[26px]">
            Identity Verification Consent
          </div>
        </div>

        {/* Body */}
        <div className="flex py-3 px-5 flex-col items-start gap-4 self-stretch overflow-y-auto">
          {/* Main consent text */}
          <div className="flex flex-col items-start gap-4">
            <div className="text-text-primary font-roboto text-base font-bold">
              To verify your identity securely and meet legal requirements, we need your consent to:
            </div>

            <div className="flex flex-col items-start gap-2">
              {[
                "1. Use your personal details (name, email, phone, address, ID)",
                "2. Scan your ID document (Aadhaar, PAN, or Passport)",
                "3. Capture your selfie or video to confirm it's really you",
                "4. Verify your ID with official sources (like DigiLocker or UIDAI)",
                "5. Store your data for XX days for audit and compliance"
              ].map((item, index) => (
                <div key={index} className="text-text-secondary font-roboto text-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Please Confirm section */}
          <div className="flex flex-col items-start gap-4 self-stretch">
            <div className="text-text-primary font-roboto text-base font-bold">
              Please Confirm
            </div>

            <div className="flex flex-col items-start gap-2 self-stretch">
              {/* Individual consent checkboxes */}
              <div className="flex items-center gap-2 self-stretch">
                <input
                  type="checkbox"
                  id="shareDetails"
                  checked={consents.shareDetails}
                  onChange={(e) => handleConsentChange('shareDetails', e.target.checked)}
                  className="w-4 h-4 rounded border border-input-border bg-background"
                />
                <label htmlFor="shareDetails" className="text-text-secondary font-roboto text-sm">
                  I agree to share my details, documents, and selfie/video for identity verification
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allowVerification"
                  checked={consents.allowVerification}
                  onChange={(e) => handleConsentChange('allowVerification', e.target.checked)}
                  className="w-4 h-4 rounded border border-input-border bg-background"
                />
                <label htmlFor="allowVerification" className="text-text-secondary font-roboto text-sm">
                  I allow my data to be verified with official authorities
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dataStorage"
                  checked={consents.dataStorage}
                  onChange={(e) => handleConsentChange('dataStorage', e.target.checked)}
                  className="w-4 h-4 rounded border border-input-border bg-background"
                />
                <label htmlFor="dataStorage" className="text-text-secondary font-roboto text-sm">
                  I understand my data will be stored for XX days after verification
                </label>
              </div>
            </div>
          </div>

          {/* Privacy policy text */}
          <div className="flex items-start gap-2 self-stretch">
            <div className="text-text-secondary font-roboto text-sm leading-normal">
              By continuing, you agree to our terms and privacy policy. You can{' '}
              <span className="text-primary cursor-pointer hover:underline">
                update your consent preferences or revoke consent here
              </span>
              . For more details, read our{' '}
              <span className="text-primary cursor-pointer hover:underline">
                Privacy Policy
              </span>
              . If you have any questions or need help, feel free to reach out to us at amritemail.com.
            </div>
          </div>

          {/* Privacy policy checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="privacyPolicy"
              checked={consents.privacyPolicy}
              onChange={(e) => handleConsentChange('privacyPolicy', e.target.checked)}
              className="w-4 h-4 rounded border border-input-border bg-background"
            />
            <label htmlFor="privacyPolicy" className="text-text-secondary font-roboto text-sm">
              I have read and agree to the Privacy Policy.
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex w-full h-[70px] py-5 px-5 justify-between items-center rounded-b border-t border-border bg-background shadow-sm">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="agreeToAll"
              checked={agreeToAll}
              onChange={(e) => handleAgreeToAll(e.target.checked)}
              className="w-4 h-4 rounded border border-input-border bg-background"
            />
            <label htmlFor="agreeToAll" className="text-text-secondary font-roboto text-sm">
              Agree to all
            </label>
          </div>

          <div className="flex justify-end items-start">
            <button
              onClick={handleAgree}
              disabled={!canAgree}
              className={`flex h-8 py-2 px-4 justify-center items-center gap-2 rounded ${
                canAgree
                  ? 'bg-primary hover:bg-primary/90'
                  : 'bg-primary/50 cursor-not-allowed'
              }`}
            >
              <span className="text-white font-roboto text-[13px] font-medium">
                I Agree
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
