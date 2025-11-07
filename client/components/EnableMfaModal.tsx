import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from "@/components/ui/dialog";

interface EnableMfaModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

type VerificationStep = "select-method" | "verify-otp";

export default function EnableMfaModal({
  isOpen,
  onClose,
  userEmail = "opindersingh@email.com",
}: EnableMfaModalProps) {
  const [verificationStep, setVerificationStep] = useState<VerificationStep>("select-method");
  const [mfaVerificationMethod, setMfaVerificationMethod] = useState<"email" | "phone">("email");
  const [mfaEmail, setMfaEmail] = useState(userEmail);
  const [phoneCountryCode, setPhoneCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpId, setOtpId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateUserMfaStatus = async () => {
    try {
      const response = await fetch("/user", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isMfaEnabled: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update MFA status");
      }

      const data = await response.json();
      console.log("MFA status updated:", data);
    } catch (err: any) {
      console.error("Error updating MFA status:", err);
      throw new Error("Failed to enable MFA. Please try again.");
    }
  };

  const handleSendVerificationCode = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mfaVerificationMethod === "email") {
        // Email OTP generation
        const response = await fetch("/api/Otp/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: mfaEmail,
            versionId: 0,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to send verification code");
        }

        const data = await response.json();
        console.log("Email OTP sent:", data);
        setSuccess("Verification code sent to your email!");
        setVerificationStep("verify-otp");
      } else {
        // Phone OTP generation
        const response = await fetch("/api/Otp/phone/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phoneCountryCode: phoneCountryCode,
            phoneNationalNumber: phoneNumber,
            channel: "sms", // or "call" based on preference
            purpose: "mfa_verification",
            versionId: 0,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to send verification code");
        }

        const data = await response.json();
        console.log("Phone OTP sent:", data);
        // Store the otpId for verification
        if (data.otpId) {
          setOtpId(data.otpId);
        }
        setSuccess("Verification code sent to your phone!");
        setVerificationStep("verify-otp");
      }
    } catch (err: any) {
      console.error("Error sending verification code:", err);
      setError(err.message || "Failed to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mfaVerificationMethod === "email") {
        // Email OTP validation
        const response = await fetch("/api/Otp/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: mfaEmail,
            otp: otp,
            versionId: 0,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Invalid verification code");
        }

        const data = await response.json();
        console.log("Email OTP verified:", data);
        
        // Update user's MFA status
        await updateUserMfaStatus();
        
        setSuccess("MFA enabled successfully!");
        
        // Close modal after successful verification
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        // Phone OTP verification
        if (!otpId) {
          throw new Error("OTP ID not found. Please request a new code.");
        }

        const response = await fetch("/api/Otp/phone/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            otpId: otpId,
            code: otp,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Invalid verification code");
        }

        const data = await response.json();
        console.log("Phone OTP verified:", data);
        
        // Update user's MFA status
        await updateUserMfaStatus();
        
        setSuccess("MFA enabled successfully!");
        
        // Close modal after successful verification
        setTimeout(() => {
          handleClose();
        }, 2000);
      }
    } catch (err: any) {
      console.error("Error verifying OTP:", err);
      setError(err.message || "Invalid verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset all states
    setVerificationStep("select-method");
    setMfaVerificationMethod("email");
    setMfaEmail(userEmail);
    setPhoneCountryCode("+1");
    setPhoneNumber("");
    setOtp("");
    setOtpId(null);
    setError(null);
    setSuccess(null);
    onClose();
  };

  const handleBack = () => {
    setVerificationStep("select-method");
    setOtp("");
    setError(null);
    setSuccess(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[510px] p-0 gap-0 rounded-lg overflow-hidden">
        <div className="flex h-[52px] px-5 py-2.5 justify-between items-center border-b border-[#D0D4E4] bg-white">
          <DialogTitle className="text-[#172B4D] font-roboto text-lg font-bold leading-[26px]">
            Enable MFA
          </DialogTitle>
          <DialogClose className="flex w-7 h-7 p-2 flex-col justify-center items-center rounded-full bg-white hover:bg-gray-100">
            <svg
              className="w-4 h-4"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 4L4 12M4 4L12 12"
                stroke="#676879"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </DialogClose>
        </div>

        <div className="flex px-5 py-5 flex-col items-start gap-4 bg-white">
          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 self-stretch p-3 rounded-lg bg-[#FEE2E2] border border-[#FCA5A5]">
              <svg
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 6V10M10 14H10.01M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
                  stroke="#DC2626"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[#DC2626] font-roboto text-[13px] font-normal leading-5">
                {error}
              </span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-start gap-2 self-stretch p-3 rounded-lg bg-[#D1FAE5] border border-[#6EE7B7]">
              <svg
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 10L8.66667 12.6667L14 7.33333M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
                  stroke="#059669"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[#059669] font-roboto text-[13px] font-normal leading-5">
                {success}
              </span>
            </div>
          )}

          {verificationStep === "select-method" ? (
            <>
              <div className="flex flex-col items-start gap-2 self-stretch">
                <h3 className="text-[#172B4D] font-roboto text-base font-semibold leading-6">
                  Enable Multi-Factor Authentication
                </h3>
                <p className="text-[#505258] font-roboto text-[13px] font-normal leading-5">
                  Choose how you want to verify your login.
                </p>
              </div>

              {/* Verification Method Selection */}
              <div className="flex items-start gap-4 self-stretch">
                {/* Email-based Verification */}
                <button
                  onClick={() => setMfaVerificationMethod("email")}
                  className={`flex flex-1 h-[70px] px-4 py-3 items-center gap-3 rounded-lg border ${
                    mfaVerificationMethod === "email"
                      ? "border-[#0073EA] bg-[#F0F7FF]"
                      : "border-[#D0D4E4] bg-white"
                  }`}
                >
                  <div className="flex w-10 h-10 p-2 justify-center items-center rounded-lg bg-[#8B5CF6]">
                    <svg
                      className="w-6 h-6"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2 7L10.1649 12.7154C10.8261 13.1783 11.1567 13.4097 11.5163 13.4993C11.8339 13.5785 12.1661 13.5785 12.4837 13.4993C12.8433 13.4097 13.1739 13.1783 13.8351 12.7154L22 7M6.8 20H17.2C18.8802 20 19.7202 20 20.362 19.673C20.9265 19.3854 21.3854 18.9265 21.673 18.362C22 17.7202 22 16.8802 22 15.2V8.8C22 7.11984 22 6.27976 21.673 5.63803C21.3854 5.07354 20.9265 4.6146 20.362 4.32698C19.7202 4 18.8802 4 17.2 4H6.8C5.11984 4 4.27976 4 3.63803 4.32698C3.07354 4.6146 2.6146 5.07354 2.32698 5.63803C2 6.27976 2 7.11984 2 8.8V15.2C2 16.8802 2 17.7202 2.32698 18.362C2.6146 18.9265 3.07354 19.3854 3.63803 19.673C4.27976 20 5.11984 20 6.8 20Z"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-col items-start gap-0.5 flex-1">
                    <span className="text-[#172B4D] font-roboto text-sm font-semibold leading-5">
                      Email-based Verification
                    </span>
                  </div>
                  <div className="flex w-5 h-5 justify-center items-center">
                    <div
                      className={`w-5 h-5 rounded-full border-2 ${
                        mfaVerificationMethod === "email"
                          ? "border-[#0073EA]"
                          : "border-[#C3C6D4]"
                      } flex items-center justify-center`}
                    >
                      {mfaVerificationMethod === "email" && (
                        <div className="w-3 h-3 rounded-full bg-[#0073EA]"></div>
                      )}
                    </div>
                  </div>
                </button>

                {/* Phone-based Verification */}
                <button
                  onClick={() => setMfaVerificationMethod("phone")}
                  className={`flex flex-1 h-[70px] px-4 py-3 items-center gap-3 rounded-lg border ${
                    mfaVerificationMethod === "phone"
                      ? "border-[#0073EA] bg-[#F0F7FF]"
                      : "border-[#D0D4E4] bg-white"
                  }`}
                >
                  <div className="flex w-10 h-10 p-2 justify-center items-center rounded-lg bg-[#EC4899]">
                    <svg
                      className="w-6 h-6"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M8.38028 8.85335C9.07627 10.303 10.0251 11.6616 11.2266 12.8632C12.4282 14.0648 13.7869 15.0136 15.2365 15.7096C15.3612 15.7694 15.4235 15.7994 15.5024 15.8224C15.7828 15.9041 16.127 15.8454 16.3644 15.6754C16.4313 15.6275 16.4884 15.5704 16.6027 15.4561C16.9523 15.1064 17.1271 14.9316 17.3029 14.8174C17.9658 14.3864 18.8204 14.3864 19.4833 14.8174C19.6591 14.9316 19.8339 15.1064 20.1835 15.4561L20.3783 15.6509C20.9098 16.1824 21.1755 16.4481 21.3198 16.7335C21.6069 17.301 21.6069 17.9713 21.3198 18.5389C21.1755 18.8242 20.9098 19.09 20.3783 19.6214L20.2207 19.779C19.6911 20.3087 19.4263 20.5735 19.0662 20.7757C18.6667 21.0001 18.0462 21.1615 17.588 21.1601C17.1751 21.1589 16.8928 21.0788 16.3284 20.9186C13.295 20.0576 10.4326 18.4332 8.04466 16.0452C5.65668 13.6572 4.03221 10.7948 3.17124 7.76144C3.01103 7.19699 2.93092 6.91477 2.9297 6.50182C2.92833 6.04364 3.08969 5.42313 3.31411 5.0236C3.51636 4.66357 3.78117 4.39876 4.3108 3.86913L4.46843 3.7115C4.99987 3.18006 5.2656 2.91433 5.55098 2.76999C6.11854 2.48292 6.7888 2.48292 7.35636 2.76999C7.64174 2.91433 7.90747 3.18006 8.43891 3.7115L8.63378 3.90637C8.98338 4.25597 9.15819 4.43078 9.27247 4.60655C9.70347 5.26945 9.70347 6.12403 9.27247 6.78692C9.15819 6.96269 8.98338 7.1375 8.63378 7.4871C8.51947 7.60142 8.46231 7.65857 8.41447 7.72538C8.24446 7.96281 8.18576 8.30707 8.26748 8.58743C8.29048 8.66632 8.32041 8.72866 8.38028 8.85335Z"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-col items-start gap-0.5 flex-1">
                    <span className="text-[#172B4D] font-roboto text-sm font-semibold leading-5">
                      Phone-based Verification
                    </span>
                  </div>
                  <div className="flex w-5 h-5 justify-center items-center">
                    <div
                      className={`w-5 h-5 rounded-full border-2 ${
                        mfaVerificationMethod === "phone"
                          ? "border-[#0073EA]"
                          : "border-[#C3C6D4]"
                      } flex items-center justify-center`}
                    >
                      {mfaVerificationMethod === "phone" && (
                        <div className="w-3 h-3 rounded-full bg-[#0073EA]"></div>
                      )}
                    </div>
                  </div>
                </button>
              </div>

              {/* Email Address Input - Only show when email verification is selected */}
              {mfaVerificationMethod === "email" && (
                <div className="flex flex-col items-start gap-2 self-stretch">
                  <label className="text-[#172B4D] font-roboto text-[13px] font-semibold leading-5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={mfaEmail}
                    onChange={(e) => setMfaEmail(e.target.value)}
                    placeholder="opindersingh@email.com"
                    className="flex h-9 px-3 py-2 items-center gap-2 self-stretch rounded border border-[#C3C6D4] bg-white text-[#505258] font-roboto text-[13px] font-normal leading-5 outline-none focus:border-[#0073EA]"
                  />
                </div>
              )}

              {/* Phone Number Input - Only show when phone verification is selected */}
              {mfaVerificationMethod === "phone" && (
                <div className="flex flex-col items-start gap-2 self-stretch">
                  <label className="text-[#172B4D] font-roboto text-[13px] font-semibold leading-5">
                    Phone Number
                  </label>
                  <div className="flex gap-2 self-stretch">
                    <input
                      type="text"
                      value={phoneCountryCode}
                      onChange={(e) => setPhoneCountryCode(e.target.value)}
                      placeholder="+1"
                      className="flex w-16 h-9 px-3 py-2 items-center gap-2 rounded border border-[#C3C6D4] bg-white text-[#505258] font-roboto text-[13px] font-normal leading-5 outline-none focus:border-[#0073EA]"
                    />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Phone number"
                      className="flex flex-1 h-9 px-3 py-2 items-center gap-2 rounded border border-[#C3C6D4] bg-white text-[#505258] font-roboto text-[13px] font-normal leading-5 outline-none focus:border-[#0073EA]"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* OTP Verification Step */}
              <div className="flex flex-col items-start gap-2 self-stretch">
                <h3 className="text-[#172B4D] font-roboto text-base font-semibold leading-6">
                  Enter Verification Code
                </h3>
                <p className="text-[#505258] font-roboto text-[13px] font-normal leading-5">
                  {mfaVerificationMethod === "email"
                    ? `We sent a verification code to ${mfaEmail}`
                    : `We sent a verification code to ${phoneCountryCode} ${phoneNumber}`}
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 self-stretch">
                <label className="text-[#172B4D] font-roboto text-[13px] font-semibold leading-5">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="flex h-9 px-3 py-2 items-center gap-2 self-stretch rounded border border-[#C3C6D4] bg-white text-[#505258] font-roboto text-[13px] font-normal leading-5 outline-none focus:border-[#0073EA]"
                />
              </div>

              <button
                onClick={handleSendVerificationCode}
                disabled={loading}
                className="text-[#0073EA] font-roboto text-[13px] font-medium leading-5 hover:underline"
              >
                Resend verification code
              </button>
            </>
          )}
        </div>

        <div className="flex h-[60px] px-5 justify-end items-center gap-2 border-t border-[#D0D4E4] bg-white">
          {verificationStep === "verify-otp" && (
            <button
              onClick={handleBack}
              disabled={loading}
              className="flex h-[38px] px-4 py-2.25 justify-center items-center gap-1 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="text-[#505258] font-roboto text-[13px] font-medium leading-normal">
                Back
              </span>
            </button>
          )}
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex h-[38px] px-4 py-2.25 justify-center items-center gap-1 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="text-[#505258] font-roboto text-[13px] font-medium leading-normal">
              Cancel
            </span>
          </button>
          <button
            onClick={
              verificationStep === "select-method"
                ? handleSendVerificationCode
                : handleVerifyOtp
            }
            disabled={
              loading ||
              (verificationStep === "select-method" &&
                ((mfaVerificationMethod === "email" && !mfaEmail) ||
                  (mfaVerificationMethod === "phone" && !phoneNumber))) ||
              (verificationStep === "verify-otp" && !otp)
            }
            className="flex h-[38px] px-4 py-2.25 justify-center items-center gap-0.5 rounded border border-[#0073EA] bg-[#0073EA] hover:bg-[#0062C6] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            ) : (
              <span className="text-white font-roboto text-[13px] font-medium leading-normal">
                {verificationStep === "select-method"
                  ? "Send Verification Code"
                  : "Verify & Enable MFA"}
              </span>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
