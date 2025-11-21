import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IdentityVerificationPage } from "@/feature/formpage/components/IdentityVerificationPage";
import { ShortCodeResolveResponse } from "@shared/api";

export default function Index() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Read shortcode from query string: /form?code={shortcode}
  const shortCode = searchParams.get("code") || undefined;
  const [templateVersionId, setTemplateVersionId] = useState<number>(1);
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputShortCode, setInputShortCode] = useState("");

  const DEMO_SHORTCODE = "Ad-5fCStWvEJoqVbxLtt26bnAqpE8-lie1RD1JYlXh2l4faiZGjFOr5O_WtRZrJuYfYzF-b2GiM_2Al2hRWKRS9EBPfoFd40G11bugUEJIEIChk9LtrWLmmit8zkyDyF24-drMfaQk5Zyl2RnZVmmMKKiitrRQcCcNMftj6E-c7KxWN0MPuuFtJ5NAwlZAb-i669e9_iz2h8_y7umUfoxzRu7HPqYZBfEufgYwcV8Hnag55i1MPKlztQgLqYdasYDL5HEmGwSr24fdOluLlnIiN8MS6VJatd";

  // const API_BASE = "https://idvapi-test.arconnet.com:1019";
  const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || "";

  // Check for DigiLocker callback at root URL
  // useEffect(() => {
  //   const code = searchParams.get("code");
  //   const state = searchParams.get("state");
  //   const jti = searchParams.get("jti");

  //   // If this is a DigiLocker callback (has code and state), handle it
  //   if (code && state) {      
  //     try {
  //       // Parse state to extract shortCode and submissionId
  //       const [shortCodeFromState, submissionIdFromState] = state.split(":");
        
  //       if (!shortCodeFromState || shortCodeFromState === "unknown") {
  //         console.error("❌ Invalid shortCode in DigiLocker state");
  //         alert("Invalid DigiLocker callback. Please try again.");
  //         return;
  //       }

  //       // Store DigiLocker data in sessionStorage
  //       localStorage.setItem("digilocker_auth_code", code);
  //       localStorage.setItem("digilocker_callback_state", state);
  //       localStorage.setItem("digilocker_jti", jti || "");
  //       localStorage.setItem("digilocker_callback_timestamp", Date.now().toString());

  // // Redirect to the form page with the shortCode in query string
  // navigate(`/form?code=${encodeURIComponent(shortCodeFromState)}`, { replace: true });
  //     } catch (error) {
  //       console.error("❌ Error processing DigiLocker callback:", error);
  //       alert("Failed to process DigiLocker response. Please try again.");
  //     }
  //   }
  // }, [searchParams, navigate]);

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
        localStorage.setItem("digilocker_callback_timestamp", Date.now().toString());

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

        console.log("📡 Calling /api/digilocker/callback ...");

        const response = await fetch(`${API_BASE}/api/digilocker/callback`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwianRpIjoiY2E4NWJiNTYtYWMzOS00YzZjLTk4MzUtY2E1NWM2ZjNlNWE0IiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZWlkZW50aWZpZXIiOiIxIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6ImFkbWluQGlkdi5sb2NhbCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL2VtYWlsYWRkcmVzcyI6ImFkbWluQGlkdi5sb2NhbCIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IlN1cGVyQWRtaW4iLCJ2ZXJpZmllZCI6ImZhbHNlIiwicm9sZXNfdmVyIjoiMSIsInBlcm0iOlsiQWNjZXNzU2Vuc2l0aXZlRGF0YSIsIkFwaUludGVncmF0aW9uTWdtdCIsIkNvbmZpZ3VyZVJiYWMiLCJDcmVhdGVFZGl0V29ya2Zsb3dzIiwiRWRpdFN5c3RlbVNldHRpbmdzIiwiTWFuYWdlU3VwcG9ydFRpY2tldHMiLCJNYW5hZ2VVc2Vyc0FuZFJvbGVzIiwiTWFudWFsT3ZlcnJpZGVSZXZpZXciLCJWaWV3UmVzcG9uZFZlcmlmaWNhdGlvbnMiXSwibmJmIjoxNzYzNzA4MTc1LCJleHAiOjE3NjM3MTE3NzUsImlzcyI6IkFyY29uLklEVi5BUEkiLCJhdWQiOiJBcmNvbi5JRFYuQ2xpZW50In0.UTmGeKxXi798V6GfeW_OggFBVdgbA3NYtv9y4rwn0d0`,
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

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (code && !state) {
      // If we have a shortcode in query string, resolve it to get template version ID
      resolveShortCode(code);
    }
  }, [searchParams]);

  const resolveShortCode = async (code: string) => {
    setLoading(true);
    setError(null);

    try {
      const resolveResponse = await fetch(
        `${API_BASE}/api/templates-link-generation/resolve?shortCode=${encodeURIComponent(code)}`,
      );
      if (!resolveResponse.ok) {
        throw new Error("Failed to resolve shortcode");
      }

      const resolveData: ShortCodeResolveResponse =
        await resolveResponse.json();

      setTemplateVersionId(resolveData.templateVersionId);
      setUserId(resolveData.userId);
    } catch (err) {
      console.error("Error resolving shortcode:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleShortCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputShortCode.trim()) {
      navigate(`/form?code=${encodeURIComponent(inputShortCode.trim())}`);
    }
  };

  const handleTryDemo = () => {
    setInputShortCode(DEMO_SHORTCODE);
    navigate(`/form?code=${encodeURIComponent(DEMO_SHORTCODE)}`);
  };

  // If no shortcode in URL, show the shortcode input page
  if (!shortCode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Identity Verification
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Enter your shortCode to continue
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleShortCodeSubmit}>
            <div>
              <label htmlFor="shortcode" className="sr-only">
                Shortcode
              </label>
              <input
                id="shortcode"
                name="shortcode"
                type="text"
                required
                value={inputShortCode}
                onChange={(e) => setInputShortCode(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder={`Write shortcode here (e.g., ${DEMO_SHORTCODE.slice(0, 20)}...)`}
              />
            </div>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={!inputShortCode.trim()}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-50 text-gray-500">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTryDemo}
                className="group relative w-full flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Try Demo Shortcode
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // If we have a shortcode but are loading, show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-900 text-lg">Loading template...</div>
      </div>
    );
  }

  // If we have an error, show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center">
            <div className="text-red-600 text-lg mb-4">Error: {error}</div>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If we have a shortcode and no error, show the identity verification page
  return (
    <IdentityVerificationPage 
      templateId={templateVersionId} 
      userId={userId} 
      shortCode={shortCode || ""} 
    />
  );
}