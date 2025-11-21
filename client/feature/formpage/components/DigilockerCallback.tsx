import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * DigiLocker Callback Handler
 *
 * DigiLocker redirects to:
 *   http://localhost:4200/?code={authCode}&state={state}&jti={jti}
 *
 * This handler:
 * 1. Extracts code, state, and jti from URL
 * 2. Stores them in localStorage
 * 3. Calls POST /api/digilocker/callback with { code, state }
 * 4. On success, reads submissionId + templateVersionId
 * 5. Navigates to /form?submissionId=...&templateVersionId=...
 */
export default function DigilockerCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const authCode = searchParams.get("code");
    const state = searchParams.get("state");
    const jti = searchParams.get("jti");

    console.log("🔐 DigiLocker callback received:", { authCode, state, jti });

    if (!authCode || !state) {
      console.log("ℹ️ Not a DigiLocker callback (missing code/state)");
      return;
    }

    const run = async () => {
      try {
        // 1) Store raw values in localStorage
        localStorage.setItem("digilocker_auth_code", authCode);
        localStorage.setItem("digilocker_callback_state", state);
        localStorage.setItem("digilocker_jti", jti || "");
        localStorage.setItem(
          "digilocker_callback_timestamp",
          Date.now().toString()
        );

        // 2) Prepare stable device fingerprint for header
        let deviceFingerprint = localStorage.getItem("device_fingerprint_desktop") || localStorage.getItem("device_fingerprint_mobile");
        if (!deviceFingerprint) {
          // Use crypto.randomUUID if available, else simple fallback
          if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            deviceFingerprint = crypto.randomUUID();
          } else {
            deviceFingerprint = `df-${Math.random().toString(36).slice(2)}-${Date.now()}`;
          }
          localStorage.setItem("device_fingerprint", deviceFingerprint);
        }

        const API_BASE_URL =
          import.meta.env.VITE_API_BASE_URL;

        console.log("📡 Calling /api/digilocker/callback ...");

        const response = await fetch(`${API_BASE_URL}/api/digilocker/callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-Fingerprint": deviceFingerprint,
          },
          body: JSON.stringify({
            code: authCode,
            state: state,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error("❌ DigiLocker callback HTTP error:", response.status, text);
          throw new Error(`HTTP ${response.status}`);
        }

        const data: {
          success: boolean;
          sessionId?: number;
          tokenReceived?: boolean;
          expiresIn?: number;
          message?: string;
          errorMessage?: string;
          submissionId?: number;
          templateVersionId?: number;
        } = await response.json();

        console.log("✅ DigiLocker callback response:", data);

        if (!data.success) {
          console.error("❌ DigiLocker callback returned success=false:", data);
          alert(data.errorMessage || "Failed to process DigiLocker response.");
          navigate("/", { replace: true });
          return;
        }

        const { submissionId, templateVersionId } = data;

        // if (!submissionId || !templateVersionId) {
        //   console.error(
        //     "❌ Missing submissionId/templateVersionId in DigiLocker response:",
        //     data
        //   );
        //   alert(
        //     "Incomplete DigiLocker response received. Please try again from the beginning."
        //   );
        //   navigate("/", { replace: true });
        //   return;
        // }

        // Optionally store IDs for later usage in /form as well
        localStorage.setItem(
          "digilocker_submission_id",
          // submissionId.toString()
          "222"
        );
        localStorage.setItem(
          "digilocker_template_version_id",
          // templateVersionId.toString()
          "222"
        );
        if (data.sessionId != null) {
          localStorage.setItem(
            "digilocker_session_id",
            data.sessionId.toString()
          );
        }

        console.log(
          `🔀 Redirecting to: /form?submissionId=111&templateVersionId=111`
        );

        // 3) Navigate to /form with IDs in query string
        navigate(
          `/formnew/?submissionId=${encodeURIComponent(
            1111
          )}&templateVersionId=${encodeURIComponent(1111)}`,
          { replace: true }
        );
      } catch (error) {
        console.error("❌ Error handling DigiLocker callback:", error);
        alert("Failed to process DigiLocker response. Please try again.");
        navigate("/", { replace: true });
      }
    };

    void run();
  }, [searchParams, navigate]);

  // Loading UI while processing
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Processing DigiLocker Response...
        </h2>
        <p className="text-gray-600">
          Please wait while we redirect you back to the form
        </p>
      </div>
    </div>
  );
}
