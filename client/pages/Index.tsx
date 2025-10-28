import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IdentityVerificationPage } from "@/components/IdentityVerificationPage";
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

  const DEMO_SHORTCODE = "AYemIxGWTQ1zjei90uyCquVea75MNcfcll7tYW6wp3WSPDKOSBLDMWEEoOmyM2ljt0vzkm75pVrSekH9uXS_TVRFNoIQ8BCJhPKRPdPLzywDu-13MBt3OF0smun8rIRjlIX43ORXimsrxPQ4ixGX8grfU0cqyNequuyYQKTqz3oGrY75eZTYvqxWk35tPnn4slRlRCKM2nJLv31L6YcBZo-SKdGrxSZokDzWQEVnd4mDSVwo7zUSpn-1r8ei4uFRcPTZDVvo8ODiAtdMf9D0a6IULBiXs14";

  // const API_BASE = "https://idvapi-test.arconnet.com:1019";
  const API_BASE = "https://idvapi-test.arconnet.com:1019";

    // import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || "";

  // Check for DigiLocker callback at root URL
  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const jti = searchParams.get("jti");

      // If this is a DigiLocker callback (has code and state), handle it
      if (code && state) {
        console.log("🔐 DigiLocker callback detected at root URL");
        
        try {
          // Parse state to extract shortCode and submissionId
          const [shortCodeFromState, submissionIdFromState] = state.split(":");
          
          if (!shortCodeFromState || shortCodeFromState === "unknown") {
            console.error("❌ Invalid shortCode in DigiLocker state");
            alert("Invalid DigiLocker callback. Please try again.");
            return;
          }

          // Store DigiLocker data in sessionStorage
          sessionStorage.setItem("digilocker_auth_code", code);
          sessionStorage.setItem("digilocker_callback_state", state);
          sessionStorage.setItem("digilocker_jti", jti || "");
          sessionStorage.setItem("digilocker_callback_timestamp", Date.now().toString());
          // Flag to skip terms and conditions on form load
          sessionStorage.setItem("digilocker_skip_consent", "true");

          // Resolve the shortcode from DigiLocker state first
          await resolveShortCode(shortCodeFromState);

          console.log("✅ DigiLocker data stored, redirecting to /form?code=" + shortCodeFromState);
          // Redirect to the form page with the shortCode in query string
          navigate(`/form?code=${encodeURIComponent(shortCodeFromState)}`, { replace: true });
        } catch (error) {
          console.error("❌ Error processing DigiLocker callback:", error);
          alert("Failed to process DigiLocker response. Please try again.");
        }
      } else if (code) {
        // If we just have a code but no state, it's a regular shortcode to resolve
        await resolveShortCode(code);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

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
      console.log("Shortcode resolved:", resolveData);

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