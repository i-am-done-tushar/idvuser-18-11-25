// ReLoginUserPage.tsx
import { useState } from "react";
import { emailLoginSchema } from "@/validations/authLoginSchema";
import { storeAuthData, type AuthResponse } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

// CIAM bits
const CIAM_URL = "https://qaanbciammy.arconnet.com";
//local
const APP_KEY = "Dpq1L3rnkE5YkAlEtrxr2eOQOG69OvpiM7uWUOPPgv7UD5/idy7KBPCzS+x9wXD7JVn+Gawh9DVxCpu2M0OAvQ==";
const ENCRYPTED_KEY = "UIhPvKz3QGYrSDAcZ6JCHg==";

//hosted 
// const APP_KEY = "KgLd9TMSUX4Ydqwwo86dA2rBQTGwDd+lIhjs0NqMi5wHkHNDGrKzHliLh0OQuIYADwE/x+hLvlLNH4kZtd0peQ==";
// const ENCRYPTED_KEY = "qUqQrWwodFhUsCghEHbO7w==";

const b64 = (v: string) => btoa(v);
const buildCiamUrl = (userId: string) =>
  `${CIAM_URL}/api/v1.0/ciamexternalauth` +
  `?Appkey=${b64(APP_KEY)}` +
  `&EncryptedKey=${b64(ENCRYPTED_KEY)}` +
  `&isDropDownRequired=false` +
  `&UserId=${b64(userId)}`;

// same helper used in admin screen
const getApiUrl = () =>
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  "https://idvapi-test.arconnet.com:1019";

export default function ReLoginUserPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [apiError, setApiError] = useState("");
  const [ciamMsg, setCiamMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const isMfaEnabledByEndUser = false;
  const navigate = useNavigate();

  // Probe CIAM, do NOT redirect here.
  // Returns "active" | "inactive" | "error"
  const probeCiamStatus = async (userId: string): Promise<"active" | "inactive" | "error"> => {
    try {
      const url = buildCiamUrl(userId);
      const res = await fetch(url, { method: "GET", mode: "cors" });
      const ct = res.headers.get("content-type") || "";

      if (ct.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        if (data?.Status === false) {
          // CIAM explicitly says inactive
          setCiamMsg((data?.error || "CIAM MFA inactive.") + " CIAM MFA not set up for end users.");
          return "inactive";
        }
        // JSON but not explicitly false → treat as active
        return "active";
      }

      // Non-JSON → typically the CIAM HTML/redirect → consider active
      return "active";
    } catch {
      // network/CORS/etc.
      setCiamMsg("Could not reach CIAM MFA right now.");
      return "error";
    }
  };

  // Actual CIAM redirect (only call if status is active)
  const redirectToCiam = (userId: string) => {
    const url = buildCiamUrl(userId);
    localStorage.setItem("pendingMfaContext", "auth-login");
    window.location.replace(url);
  };

  const handleLogin = async () => {
    setEmailError("");
    setApiError("");

    const trimmedEmail = email.trim();
    const parsed = emailLoginSchema.safeParse({ email: trimmedEmail });
    if (!parsed.success) {
      setEmailError(parsed.error.errors[0]?.message || "Please enter a valid email address.");
      return;
    }
    if (!password) {
      setApiError("Password is required.");
      return;
    }

    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      const resp = await fetch(`${apiUrl}/api/Auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password })
      });

      if (resp.ok) {
        const authResponse: AuthResponse = await resp.json();
        storeAuthData(authResponse);

        // post-login MFA decision:
        const ciamStatus = await probeCiamStatus(trimmedEmail);

        if (ciamStatus === "active") {
          redirectToCiam(trimmedEmail);
          return;
        }

        // CIAM inactive or CIAM error:
        // If end-user MFA is enabled, go to manual OTP route.
        if (isMfaEnabledByEndUser) {
          navigate("/auth/login", { replace: true });
          return;
        }

        // Else,show message (bth ciam mfa and manual mfa disabled)
        // End-user MFA disabled → go straight to the app
        navigate("/dashboard", { replace: true });

        return;
      }

      // Not OK: handle invalid creds vs other errors
      const ct = resp.headers.get("content-type") || "";
      let problem: any = {};
      if (ct.includes("application/json")) {
        try { problem = await resp.json(); } catch {}
      } else {
        try { problem.detail = await resp.text(); } catch {}
      }
      const is401 =
        resp.status === 401 ||
        problem?.status === 401 ||
        String(problem?.title || "").toLowerCase() === "unauthorized";
      setApiError(
        is401
          ? "Invalid credentials. Please try again."
          : problem?.detail || problem?.message || problem?.title || `Login failed (${resp.status}). Please try again.`
      );
    } catch {
      setApiError("Unable to reach authentication service. Check API URL and CORS.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-white flex flex-col lg:flex-row overflow-hidden">
      {/* Left illustration (desktop only) */}
      <div className="relative hidden lg:block lg:w-1/2 bg-white overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute w-[342px] h-[342px] rounded-full bg-[#BCD2E8] blur-[115px] left-[240px] top-[300px]" />
          <div className="absolute w-[465px] h-[397px] rounded-full bg-[#E0EFFE] blur-[80px] left-0 top-0" />
        </div>

        <div className="absolute left-[275px] top-[140px]">
          <div className="absolute w-[252px] h-[318px] rounded-3xl border border-black/10 bg-gradient-to-br from-[#E0EFFE] via-[#F3CFFF] to-[#F3CFFF] backdrop-blur-[7.5px] rotate-[6.554deg]" />
          <div className="absolute w-[252px] h-[318px] rounded-3xl border border-black/10 bg-white left-[1px] top-[10px]" />
          <div className="absolute w-[185px] h-[130px] rounded-2xl bg-[#E0EFFE] left-[33px] top-[65px]" />
          <svg className="absolute w-6 h-6 left-[212px] top-[26px]" viewBox="0 0 24 24" fill="none">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 1C5.92487 1 1 5.92487 1 12C1 18.0751 5.92487 23 12 23C18.0751 23 23 18.0751 23 12C23 5.92487 18.0751 1 12 1ZM17.2071 9.70711C17.5976 9.31658 17.5976 8.68342 17.2071 8.29289C16.8166 7.90237 16.1834 7.90237 15.7929 8.29289L10.5 13.5858L8.20711 11.2929C7.81658 10.9024 7.18342 10.9024 6.79289 11.2929C6.40237 11.6834 6.40237 12.3166 6.79289 12.7071L9.79289 15.7071C10.1834 16.0976 10.8166 16.0976 11.2071 15.7071L17.2071 9.70711Z"
              fill="#258750"
            />
          </svg>
        </div>

        <div className="absolute bottom-24 left-20 right-20 text-center">
          <h2 className="text-[#172B4D] text-[28px] md:text-[32px] font-bold leading-tight mb-4">
            Proof of identity, made simple.
          </h2>
          <p className="text-[#676879] text-[13px]">
            Easily verify your identity in seconds with our secure and seamless process.
          </p>
        </div>
      </div>

      {/* Right side */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 md:px-12 py-10 relative">
        <div className="flex justify-start md:justify-end mb-8">
          <div className="flex items-center gap-2 md:gap-3">
            <svg width="26" height="26" viewBox="0 0 30 30" fill="none">
              <path
                d="M27.3723 22.6039C27.9964 23.7209 27.189 25.097 25.9095 25.097H4.88702C3.6005 25.097 2.79387 23.7073 3.43201 22.5902L14.0587 3.98729C14.7055 2.85516 16.3405 2.86285 16.9765 4.00102L27.3723 22.6039Z"
                stroke="#D83A52"
                strokeWidth="2.5"
                fill="none"
              />
            </svg>
            <span className="text-[#323238] text-[22px] font-bold">arcon</span>
          </div>
        </div>

        <div className="w-full max-w-[380px] mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-[#172B4D] text-[24px] md:text-[28px] font-bold">Welcome Back</h1>
            <p className="text-[#8C90A3] text-sm mt-1">Get a login code via email.</p>
          </div>

          {ciamMsg && (
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm mb-4">
              {ciamMsg}
            </div>
          )}
          {apiError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              {apiError}
            </div>
          )}

          <div className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-[#5A5F73] text-xs font-medium mb-2">Email Address</label>
              <input
                type="text"
                value={email}
                onChange={(e) => {
                  const trimmed = e.target.value.trimStart();
                  setEmail(trimmed);
                  setEmailError("");
                }}
                onBlur={() => {
                  const trimmed = email.trim();
                  setEmail(trimmed);
                  const ok = emailLoginSchema.safeParse({ email: trimmed }).success;
                  if (!ok) setEmailError("Please enter a valid email address.");
                }}
                placeholder="example@domain.com"
                className="w-full h-11 px-3 border border-[#E0E3EB] rounded text-[14px] text-[#323238] placeholder:text-[#A4A7B5] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
              {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[#5A5F73] text-xs font-medium mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-11 px-3 pr-10 border border-[#E0E3EB] rounded text-[14px] text-[#323238] placeholder:text-[#A4A7B5] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C90A3]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M10.6 10.6a3 3 0 004.24 4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M9.9 5.6C11.1 5.2 12.3 5 14 5c4 0 7 3.5 8 7-1 3.5-4 7-8 7-1.7 0-2.9-.3-4.1-.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Login */}
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading || !email.trim() || !!emailError || !password}
              className={`w-full h-11 rounded text-sm font-semibold transition-colors ${
                email.trim() && !loading && !emailError && password
                  ? "bg-[#3B82F6] hover:bg-[#2563eb] text-white"
                  : "bg-[#93c5fd] text-white cursor-not-allowed"
              }`}
            >
              {loading ? "Processing..." : "Login"}
            </button>

            {/* Divider + extras */}
            <div className="flex items-center gap-3">
              <div className="h-px bg-[#E0E3EB] flex-1" />
              <span className="text-[#8C90A3] text-xs">Or Continue With</span>
              <div className="h-px bg-[#E0E3EB] flex-1" />
            </div>

            <div className="flex items-center justify-between">
              <button type="button" className="text-[#2563EB] text-xs hover:underline">
                Forgot Password?
              </button>
            </div>

            <button
              type="button"
              className="w-full h-11 rounded border border-[#E0E3EB] flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              <img src="/images/google-icon.svg" alt="" className="w-5 h-5" />
              <span className="text-[#323238] text-sm font-medium">Sign in with Google</span>
            </button>

            <p className="text-[11px] text-[#8C90A3] text-center">
              By logging in, you agree to our terms of service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
