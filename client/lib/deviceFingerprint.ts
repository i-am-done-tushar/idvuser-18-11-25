/**
 * Generate a UUID v4 format fingerprint
 */
function generateFingerprint(): string {
  try {
    // Prefer crypto.randomUUID when available (modern browsers)
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID();
    } else {
      // Fallback: generate UUID v4 format manually
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  } catch (e) {
    // Final fallback if all else fails
    return `dev-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Get or create a unique device fingerprint for Desktop/Primary device.
 * 
 * Used by IdentityVerificationPage and all desktop-initiated API calls.
 * Stored in localStorage as 'device_fingerprint_desktop'.
 * 
 * @returns {string} The desktop device fingerprint in UUID v4 format
 * 
 * @example
 * const desktopFp = getDesktopDeviceFingerprint(); // Returns "aaaa-bbbb-cccc-dddd"
 */
export function getDesktopDeviceFingerprint(): string {
  let fingerprint: string | null = null;
  
  try {
    fingerprint = localStorage.getItem("device_fingerprint_desktop");
  } catch (e) {
    fingerprint = null;
  }

  if (!fingerprint) {
    fingerprint = generateFingerprint();
    try {
      localStorage.setItem("device_fingerprint_desktop", fingerprint);
    } catch (e) {
      // Ignore storage errors - fingerprint will be temporary for this session
    }
  }

  return fingerprint;
}

/**
 * Get or create a unique device fingerprint for Mobile/Handoff device.
 * 
 * Used by HandoffPage (accessed via QR code) and all mobile-initiated API calls.
 * Stored in localStorage as 'device_fingerprint_mobile'.
 * 
 * @returns {string} The mobile device fingerprint in UUID v4 format
 * 
 * @example
 * const mobileFp = getMobileDeviceFingerprint(); // Returns "xxxx-yyyy-zzzz-wwww"
 */
export function getMobileDeviceFingerprint(): string {
  let fingerprint: string | null = null;
  
  try {
    fingerprint = localStorage.getItem("device_fingerprint_mobile");
  } catch (e) {
    fingerprint = null;
  }

  if (!fingerprint) {
    fingerprint = generateFingerprint();
    try {
      localStorage.setItem("device_fingerprint_mobile", fingerprint);
    } catch (e) {
      // Ignore storage errors - fingerprint will be temporary for this session
    }
  }

  return fingerprint;
}

/**
 * Auto-detect which device fingerprint to use based on current URL.
 * 
 * - If URL contains "/HandoffPage/" → Mobile device fingerprint
 * - Otherwise → Desktop device fingerprint
 * 
 * This allows shared components to automatically use the correct fingerprint
 * without needing to pass props.
 * 
 * @returns {string} The appropriate device fingerprint
 */
export function getDeviceFingerprint(): string {
  // Check if we're on the HandoffPage (Mobile device)
  if (typeof window !== 'undefined' && window.location.pathname.includes('/HandoffPage/')) {
    return getMobileDeviceFingerprint();
  }
  
  // Default to Desktop device
  return getDesktopDeviceFingerprint();
}
