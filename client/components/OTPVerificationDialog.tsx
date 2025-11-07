import { useState, useRef, useEffect } from "react";
import { CloseIcon, Spinner } from "./SVG_Files";

interface OTPVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void; // ignored when not closable
  onVerify: (otp: string) => void | Promise<void>;
  recipientEmail?: string;
  recipientPhone?: string;
  type: "email" | "phone";
  onResend: () => void | Promise<void>;

  /** Block closing the dialog (no X, no backdrop/ESC) unless type === "phone" */
  nonDismissable?: boolean;

  helperText?: string | null;
  errorText?: string | null;
  headline?: string;
  bodyText?: string;
}

export function OTPVerificationDialog({
  isOpen,
  onClose,
  onVerify,
  recipientEmail,
  recipientPhone,
  type,
  onResend,
  nonDismissable = false,
  helperText = null,
  errorText = null,
  headline,
  bodyText,
}: OTPVerificationDialogProps) {
  // Phone dialog should always be closable
  const isClosable = type === "phone" || !nonDismissable;

  const [otpValues, setOtpValues] = useState<string[]>(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const recipient = type === "email" ? recipientEmail : recipientPhone;

  const defaultHeadline = headline ?? (type === "email" ? "Check your email" : "Check your phone");
  const defaultBody =
    bodyText ??
    `We sent a one-time passcode to ${recipient ?? (type === "email" ? "your email" : "your phone")}.`;

  // Reset OTP & focus first box when opened
  useEffect(() => {
    if (!isOpen) return;
    setOtpValues(["", "", "", "", "", ""]);
    setIsVerifying(false);
    const t = window.setTimeout(() => inputRefs.current[0]?.focus(), 100);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // ESC key handling: allow only if closable
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isClosable) onClose();
        else {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [isOpen, isClosable, onClose]);

  // 🔒 Lock background scroll while open
  useEffect(() => {
    if (!isOpen) return;

    const body = document.body;
    const html = document.documentElement;

    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    body.style.overflow = "hidden";

    const preventTouch = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", preventTouch, { passive: false });

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
      document.removeEventListener("touchmove", preventTouch as any);
    };
  }, [isOpen]);

  const handleInputChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;

    const next = [...otpValues];
    next[index] = value;
    setOtpValues(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;

    const next = [...otpValues];
    for (let i = 0; i < 6; i++) next[i] = digits[i] || "";
    setOtpValues(next);

    const nextEmptyIndex = next.findIndex((v) => v === "");
    inputRefs.current[nextEmptyIndex === -1 ? 5 : Math.min(nextEmptyIndex, 5)]?.focus();
  };

  const handleVerify = async () => {
    const otp = otpValues.join("");
    if (otp.length !== 6) return;
    setIsVerifying(true);
    try {
      await onVerify(otp);
    } finally {
      setIsVerifying(false);
    }
  };

  const isOTPComplete = otpValues.every((v) => v !== "");

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={isClosable ? onClose : undefined}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-[408px] mx-4 bg-white rounded-lg shadow-xl">
        <div className="flex flex-col p-6 pb-6 gap-4 max-h-[80vh] overflow-y-auto">
          {/* Close Button — visible if closable (always true for phone dialog) */}
          <div className="flex justify-end">
            {isClosable && (
              <button
                onClick={onClose}
                className="flex w-8 h-8 justify-center items-center rounded-full bg-white hover:bg-gray-50 transition-colors"
                aria-label="Close dialog"
                title="Close"
              >
                <CloseIcon width={20} height={20} />
              </button>
            )}
          </div>

          {/* Header & Body copy */}
          <div className="flex flex-col gap-1 text-center">
            <h2 className="text-text-primary font-roboto text-[22px] font-bold leading-[32px]">
              {defaultHeadline}
            </h2>
            <p className="text-text-muted font-roboto text-sm leading-[20px]">
              {defaultBody}
            </p>
            {helperText && <p className="text-[12px] text-gray-500 mt-1">{helperText}</p>}
          </div>

          {/* OTP Input Group */}
          <div className="flex justify-center gap-2 mt-2">
            {otpValues.map((value, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={value}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                className="w-12 h-[54px] text-center text-lg font-medium border border-input-border rounded bg-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                aria-label={`Digit ${index + 1}`}
              />
            ))}
          </div>

          {/* Inline error */}
          {errorText && <div className="text-center text-[12px] text-red-600 -mt-1">{errorText}</div>}

          {/* Resend */}
          <div className="text-center">
            <span className="text-text-muted font-roboto text-sm">Didn't get a code? </span>
            <button
              onClick={onResend}
              className="text-primary font-roboto text-sm underline hover:text-primary/80 transition-colors"
            >
              Click to Resend
            </button>
          </div>

          {/* Verify */}
          <button
            onClick={handleVerify}
            disabled={!isOTPComplete || isVerifying}
            className={`w-full h-12 px-4 flex justify-center items-center gap-2 rounded font-roboto text-base font-bold transition-colors ${
              isOTPComplete && !isVerifying
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-primary/50 text-white cursor-not-allowed"
            }`}
          >
            {isVerifying ? (
              <>
                <Spinner className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
  
