import { ArconLogo, RipplingLogo, SuccessBadge } from "./SVG_Files";

export function VerificationSuccessPage() {
  return (
    <div className="flex w-full min-h-screen flex-col bg-page-background">
      {/* Header */}
      <div className="flex w-full h-11 items-center px-8 border-b border-[#D0D4E4] bg-white">
        {/* Arcon Logo */}
        <div className="flex items-center gap-2">
          <ArconLogo />
        </div>

        {/* Divider */}
        <div className="w-[1px] h-5 bg-[#D0D4E4] mx-2" />

        {/* Rippling Logo */}
        <div className="flex items-center justify-center">
          <RipplingLogo />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex w-full max-w-4xl justify-center items-center">
          <div className="flex w-full max-w-[672px] h-[284px] p-14 flex-col justify-center items-center gap-14 rounded-2xl bg-white">
            {/* Success Icon and Content */}
            <div className="flex flex-col items-center gap-6 w-full max-w-[560px]">
              {/* Success Icon */}
              <div className="flex flex-col items-center gap-6">
                <SuccessBadge />

                {/* Text Content */}
                <div className="flex flex-col items-center gap-6 text-center">
                  <h1 className="text-[#172B4D] font-roboto text-[32px] font-bold leading-tight">
                    Verification successful
                  </h1>
                  <p className="text-[#676879] font-roboto text-base font-normal leading-normal">
                    Your identity has been verified.
                  </p>
                </div>
              </div>

              {/* Dashboard Button */}
              <button
                onClick={() => (window.location.href = "/password-setup")}
                className="flex h-12 px-6 py-3 justify-center items-center gap-2 rounded bg-primary hover:bg-primary/90 transition-colors"
              >
                <span className="text-white font-roboto text-base font-medium">
                  Set Your Password
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
