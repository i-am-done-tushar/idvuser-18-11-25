import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Header } from "../components/Header";
import { StepSidebar } from "../components/StepSidebar";
import { HowItWorksDialog } from "../components/HowItWorksDialog";
import { ConsentDialog } from "../components/ConsentDialog";
import { OTPVerificationDialog } from "../components/OTPVerificationDialog";
import { DynamicSection } from "../components/DynamicSection";
import { DesktopDynamicSection } from "../components/DesktopDynamicSection";
import { FormData } from "@shared/templates";
import { TemplateVersionResponse } from "@shared/api";
import { useToast } from "@/hooks/use-toast";
import {
  isValidName,
  isValidEmail,
  isValidPhoneForCountry,
  isValidDOB,
  isValidAddress,
  isValidPostalCode,
} from "@/lib/validation";
import * as signalR from '@microsoft/signalr';
import { getMobileDeviceFingerprint } from "@/lib/deviceFingerprint";

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || "";

// 🚀 DEVELOPMENT FLAG - bypass OTP correctness but STILL hit backend
const BYPASS_OTP_FOR_DEVELOPMENT = true;

// token helper
const getToken = () =>
  (typeof window !== "undefined" && localStorage.getItem("access")) || null;

interface HandoffSnapshot {
  personalInfoBySection: Record<string, string>;
  documents: any[];
  progress: any[];
}

interface HandoffResolveResponse {
  submissionId: number;
  accessToken: string;
  expiresAtUtc: string;
  snapshot: HandoffSnapshot;
}

export default function HandoffPage() {
  const { joincode } = useParams<{ joincode: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [templateVersion, setTemplateVersion] = useState<TemplateVersionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [isEmailVerified, setIsEmailVerified] = useState(true); // Pre-verified via handoff
  const [isPhoneVerified, setIsPhoneVerified] = useState(true); // Pre-verified via handoff
  const [isIdentityDocumentCompleted, setIsIdentityDocumentCompleted] = useState(false);
  const [hasShownStep1Toast, setHasShownStep1Toast] = useState(false);
  const [hasShownStep2Toast, setHasShownStep2Toast] = useState(false);
  const [hasShownWelcomeBackToast, setHasShownWelcomeBackToast] = useState(false);
  const [isSelfieCompleted, setIsSelfieCompleted] = useState(false);

  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [hasConsented, setHasConsented] = useState(true); // Pre-consented via handoff
  const [showHowItWorksDialog, setShowHowItWorksDialog] = useState(false);

  const [emailLocked, setEmailLocked] = useState(true); // Email locked in handoff

  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({ 1: true });
  const [completedSections, setCompletedSections] = useState<Record<number, boolean>>({});
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(1);

  // OTP dialog + state
  const [showOTPDialog, setShowOTPDialog] = useState(false);
  const [otpType, setOtpType] = useState<"email" | "phone">("email");
  const [pendingVerification, setPendingVerification] = useState<{
    type: "email" | "phone";
    recipient: string;
    otpId?: number;
    expiresAt?: string;
  } | null>(null);

  const [otpSending, setOtpSending] = useState(false);
  const [otpValidating, setOtpValidating] = useState(false);

  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);

  // eTag for Personal Information section (for optimistic concurrency control with PUT)
  const [personalInfoETag, setPersonalInfoETag] = useState<string>("AAAAAAAAAAAAAAAAAAAAAA==");

  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    middleName: "",
    dateOfBirth: "",
    email: "",
    countryCode: "",
    phoneNumber: "",
    gender: "",
    address: "",
    city: "",
    postalCode: "",
    permanentAddress: "",
    permanentCity: "",
    permanentPostalCode: "",
  });

  const [documentFormState, setDocumentFormState] = useState({
    country: "",
    selectedDocument: "",
    uploadedDocuments: [] as string[],
    uploadedFiles: [] as Array<{id: string, name: string, size: string, type: string}>,
    documentUploadIds: {} as Record<string, { front?: number; back?: number }>,
    documentsDetails: [] as Array<{
      documentName: string;
      documentDefinitionId: number | string;
      frontFileId: number;
      backFileId?: number;
      status: "uploaded" | "pending";
      uploadedAt: string;
    }>,
  });

  const [biometricFormState, setBiometricFormState] = useState({
    capturedImage: null as string | null,
    isImageCaptured: false,
  });

  // SignalR connection ref
  const signalRConnectionRef = useRef<signalR.HubConnection | null>(null);

  const getPersonalInfoConfig = () => {
    if (!templateVersion) return {};
    const personalInfoSection = templateVersion.sections.find(
      (section) => section.sectionType === "personalInformation",
    );
    if (!personalInfoSection || !personalInfoSection.fieldMappings?.[0]?.structure) {
      return {};
    }
    const fieldConfig = personalInfoSection.fieldMappings[0].structure as any;
    return fieldConfig.personalInfo || {};
  };

  // ---- OTP API calls: return status on error for toasts ----
  async function generateEmailOtp(email: string, versionId: number) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/Otp/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email, versionId }),
    });

    if (!res.ok) {
      const status = res.status;
      const text = await res.text().catch(() => "");
      const err: any = new Error(text || `Failed to send OTP`);
      err.status = status;
      throw err;
    }
  }

  async function validateEmailOtp(
    email: string,
    versionId: number,
    otp: string,
    submissionId: number | null,
    accessTokenLifetime = "10:00:00"
  ) {
    const token = getToken();

    if (submissionId == null || versionId == null) {
      const err: any = new Error("Missing submissionId or versionId for email verification");
      err.status = 400;
      throw err;
    }

    const res = await fetch(`${API_BASE}/api/Otp/email/verify-and-issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        email,
        otp,
        submissionId,
        versionId,
        accessTokenLifetime,
      }),
    });

    if (!res.ok) {
      const status = res.status;
      const text = await res.text().catch(() => "");
      const err: any = new Error(text || `Invalid OTP`);
      err.status = status;
      throw err;
    }

    const bodyText = await res.text().catch(() => "");
    try {
      return bodyText ? JSON.parse(bodyText) : null;
    } catch (e) {
      return null;
    }
  }

  async function sendSessionHeartbeat() {
    const token = getToken();

    // Get mobile device fingerprint (Device 2 - Handoff)
    const fingerprint = getMobileDeviceFingerprint();

    const res = await fetch(`${API_BASE}/api/session/heartbeat`, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "X-Device-Fingerprint": fingerprint || "",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "",
    });

    if (!res.ok) {
      const status = res.status;
      const text = await res.text().catch(() => "");
      const err: any = new Error(text || `Failed to send heartbeat`);
      err.status = status;
      throw err;
    }

    const bodyText = await res.text().catch(() => "");
    try {
      return bodyText ? JSON.parse(bodyText) : null;
    } catch (e) {
      return null;
    }
  }

  async function startPhoneOtp(
    phoneCountryCode: string,
    phoneNationalNumber: string,
    versionId: number,
    channel = "whatsapp",
    purpose = "phoneVerification"
  ) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/Otp/phone/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        phoneCountryCode,
        phoneNationalNumber,
        channel,
        purpose,
        versionId,
      }),
    });

    const status = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err: any = new Error(text || `Failed to start phone OTP`);
      err.status = status;
      throw err;
    }

    return res.json() as Promise<{ success: boolean; otpId: number; expiresAt: string }>;
  }

  async function verifyPhoneOtp(otpId: number, code: string) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/Otp/phone/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ otpId, code: String(code).trim() }),
    });

    const status = res.status;
    const bodyText = await res.text().catch(() => "");
    let json: any = null;
    try { json = bodyText ? JSON.parse(bodyText) : null; } catch {}

    if (!res.ok || (json && json.success === false)) {
      const msg = (json?.message || bodyText || `Invalid OTP`).toString();
      const err: any = new Error(msg);
      err.status = status;
      throw err;
    }

    return (json ?? { success: true }) as { success: boolean };
  }

  const getActiveVersionId = () =>
    templateVersion?.versionId ?? null;

  // ---- SignalR WebSocket connection ----
  const connectToSignalR = async (accessToken: string, submissionId: number) => {
    try {
      // Close existing connection if any
      if (signalRConnectionRef.current) {
        await signalRConnectionRef.current.stop();
      }

      // Get mobile device fingerprint (Device 2 - Handoff)
      const deviceFingerprint = getMobileDeviceFingerprint();
      console.log('🔑 Mobile Device Fingerprint (Device 2) for SignalR:', deviceFingerprint);

      // Build SignalR connection
      const connection = new signalR.HubConnectionBuilder()
        .withUrl(`ws://10.10.5.231:5027/hubs/handoff?access_token=${accessToken}`, {
          skipNegotiation: true,
          transport: signalR.HttpTransportType.WebSockets,
          timeout: 60000, // 60 seconds timeout
          // Add custom headers including device fingerprint
          headers: {
            'X-Device-Fingerprint': deviceFingerprint
          }
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (retryContext) => {
            // Exponential backoff: 0, 2, 10, 30 seconds
            if (retryContext.previousRetryCount === 0) return 0;
            if (retryContext.previousRetryCount === 1) return 2000;
            if (retryContext.previousRetryCount === 2) return 10000;
            return 30000;
          }
        })
        .configureLogging(signalR.LogLevel.Debug)
        .build();

      // Handle reconnection
      connection.onreconnecting((error) => {
        console.log('🔄 SignalR reconnecting...', error);
        console.log('🔄 Reconnection attempt due to:', error?.message || 'Unknown reason');
        toast({
          title: "Reconnecting...",
          description: "Connection lost, attempting to reconnect.",
          duration: 3000,
        });
      });

      connection.onreconnected((connectionId) => {
        console.log('✅ SignalR reconnected with connectionId:', connectionId);
        toast({
          title: "✅ Reconnected",
          description: "Connection restored successfully.",
          duration: 3000,
        });
      });

      connection.onclose((error) => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ SignalR CONNECTION CLOSED');
        console.error('❌ Close reason:', error?.message || 'No error provided');
        console.error('❌ Error details:', error);
        console.error('❌ Connection was in state:', connection.state);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Clear heartbeat interval when connection closes
        const interval = (connection as any)._heartbeatInterval;
        if (interval) {
          clearInterval(interval);
          console.log('🛑 Heartbeat interval cleared on connection close');
        }
        
        if (error) {
          toast({
            title: "❌ Connection Lost",
            description: `Connection closed: ${error.message}`,
            variant: "destructive",
            duration: 5000,
          });
        } else {
          console.log('ℹ️ Connection closed gracefully (no error)');
        }
      });

      // Listen for file upload completed events
      connection.on('file.upload.completed', (data: any) => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔔 SignalR Updated: file.upload.completed');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📨 RAW Data:', data);
        console.log('✅ File Upload Completed:');
        console.log('   📄 File Name:', data.fileName);
        console.log('   🆔 File ID:', data.fileId);
        console.log('   📋 Submission ID:', data.submissionId);
        console.log('   📑 Document Definition ID:', data.documentDefinitionId);
        console.log('   📦 Size (bytes):', data.sizeBytes);
        console.log('   📂 Storage Path:', data.storagePath);
        console.log('   ⏰ Uploaded At:', data.uploadedAtUtc);
        console.log('   🏷️  Content Type:', data.contentType);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        toast({
          title: "📎 File Uploaded",
          description: `Document uploaded: ${data.fileName || 'Unknown file'}`,
          duration: 4000,
        });
      });

      // Listen for generic notifications (if backend sends any)
      connection.on('ReceiveNotification', (message: string) => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔔 SignalR Updated: ReceiveNotification');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📨 RAW Message:', message);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        toast({
          title: "📨 Notification",
          description: message.length > 100 ? message.substring(0, 100) + '...' : message,
          duration: 3000,
        });
      });

      console.log('📡 Registered handlers for: file.upload.completed, ReceiveNotification');

      // Start connection
      await connection.start();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ SignalR CONNECTED to handoff hub');
      console.log('✅ Connection State:', connection.state);
      console.log('✅ Connection ID:', connection.connectionId);
      console.log('✅ Transport:', 'WebSockets');
      console.log('✅ Submission ID:', submissionId);
      console.log('✅ Device Fingerprint:', deviceFingerprint);
      console.log('✅ Access Token (first 50 chars):', accessToken.substring(0, 50) + '...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Try to explicitly subscribe to notifications for this submission
      try {
        console.log('📞 Attempting to invoke JoinSubmission on hub with submissionId:', submissionId);
        await connection.invoke('JoinSubmission', submissionId);
        console.log('✅ Successfully joined submission:', submissionId);
      } catch (invokeError: any) {
        console.warn('⚠️ JoinSubmission method not available or failed:', invokeError.message);
        console.log('ℹ️ Backend might auto-register based on JWT token in URL');
      }
      
      toast({
        title: "🔗 Connected",
        description: `Real-time updates enabled for submission:${submissionId}`,
        duration: 3000,
      });

      signalRConnectionRef.current = connection;

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (connection.state === signalR.HubConnectionState.Connected) {
          console.log('💓 Heartbeat - Connection still alive');
        } else {
          console.warn('⚠️ Heartbeat - Connection not in Connected state:', connection.state);
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Every 30 seconds

      // Store interval reference for cleanup
      (connection as any)._heartbeatInterval = heartbeatInterval;
    } catch (err) {
      console.error('❌ SignalR connection failed:', err);
      toast({
        title: "Connection Error",
        description: "Failed to connect to real-time updates.",
        variant: "destructive",
        duration: 4000,
      });
    }
  };

  // ---- OTP handlers ----
  const handleSendEmailOTP = async () => {
    const email = formData.email?.trim();
    const versionId = getActiveVersionId();

    if (emailLocked) {
      toast({ title: "Email locked", description: "This email is already verified and cannot be changed.", variant: "destructive" });
      return;
    }

    if (!email || !isValidEmail(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (versionId == null) {
      toast({ title: "Error", description: "Template version not loaded.", variant: "destructive" });
      return;
    }

    try {
      setOtpSending(true);
      await generateEmailOtp(email, versionId);
      setPendingVerification({ type: "email", recipient: email });
      setOtpType("email");
      setShowOTPDialog(true);
      toast({ title: "OTP Sent", description: `A verification code has been sent to ${email}` });
    } catch (err: any) {
      const statusCode = err.status || "Unknown";
      const message = err.message || "Failed to send OTP";
      toast({ title: `${statusCode} – Error`, description: message, variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  };

  const handleSendPhoneOTP = async () => {
    const versionId = getActiveVersionId();
    if (versionId == null) {
      toast({ title: "Error", description: "Template version not loaded.", variant: "destructive" });
      return;
    }

    const cc = (formData.countryCode || "").trim();
    const nn = (formData.phoneNumber || "").replace(/\D+/g, "");
    if (!cc || !nn || !isValidPhoneForCountry(formData.countryCode, formData.phoneNumber)) {
      toast({ title: "Invalid phone number", description: "Please enter a valid phone number.", variant: "destructive" });
      return;
    }

    try {
      setOtpSending(true);
      const result = await startPhoneOtp(cc, nn, versionId);
      setPendingVerification({
        type: "phone",
        recipient: `${cc} ${nn}`,
        otpId: result.otpId,
        expiresAt: result.expiresAt,
      });
      setOtpType("phone");
      setShowOTPDialog(true);
      toast({ title: "OTP Sent", description: `A verification code has been sent to ${cc} ${nn}` });
    } catch (err: any) {
      const statusCode = err.status || "Unknown";
      const message = err.message || "Failed to send phone OTP";
      toast({ title: `${statusCode} – Error`, description: message, variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  };

  const handleOTPVerify = async (otp: string) => {
    if (!pendingVerification) return;

    if (pendingVerification.type === "email") {
      const email = pendingVerification.recipient;
      const versionId = getActiveVersionId();
      if (!versionId) {
        toast({ title: "Error", description: "Template version not loaded.", variant: "destructive" });
        return;
      }

      try {
        setOtpValidating(true);
        const result = await validateEmailOtp(email, versionId, otp, submissionId);

        if (result?.access) {
          localStorage.setItem("access", result.access);
          localStorage.setItem("accessToken", result.access);
        }

        setIsEmailVerified(true);
        setEmailLocked(true);
        setShowOTPDialog(false);
        setPendingVerification(null);

        toast({ title: "✅ Email Verified", description: "Your email has been successfully verified!" });

        try {
          await sendSessionHeartbeat();
        } catch (hbErr) {
          console.error("Heartbeat failed:", hbErr);
        }
      } catch (err: any) {
        const statusCode = err.status || "Unknown";
        const message = err.message || "Invalid OTP";

        if (BYPASS_OTP_FOR_DEVELOPMENT) {
          setIsEmailVerified(true);
          setEmailLocked(true);
          setShowOTPDialog(false);
          setPendingVerification(null);
          toast({ title: "✅ Email Verified (DEV MODE)", description: "Bypassing OTP check for development." });
        } else {
          toast({ title: `${statusCode} – Error`, description: message, variant: "destructive" });
        }
      } finally {
        setOtpValidating(false);
      }
      return;
    }

    // PHONE verify
    const code = String(otp || "").trim();
    if (!pendingVerification.otpId) {
      toast({ title: "Error", description: "No OTP session found.", variant: "destructive" });
      return;
    }

    try {
      setOtpValidating(true);
      await verifyPhoneOtp(pendingVerification.otpId, code);

      setIsPhoneVerified(true);
      setShowOTPDialog(false);
      setPendingVerification(null);

      toast({ title: "✅ Phone Verified", description: "Your phone has been successfully verified!" });
    } catch (err: any) {
      const statusCode = err.status || "Unknown";
      const message = err.message || "Invalid OTP";

      if (BYPASS_OTP_FOR_DEVELOPMENT) {
        setIsPhoneVerified(true);
        setShowOTPDialog(false);
        setPendingVerification(null);
        toast({ title: "✅ Phone Verified (DEV MODE)", description: "Bypassing OTP check for development." });
      } else {
        toast({ title: `${statusCode} – Error`, description: message, variant: "destructive" });
      }
    } finally {
      setOtpValidating(false);
    }
  };

  const handleOTPResend = async () => {
    const versionId = getActiveVersionId();

    if (pendingVerification?.type === "email") {
      const email = pendingVerification.recipient;
      if (!versionId) return;
      try {
        setOtpSending(true);
        await generateEmailOtp(email, versionId);
        toast({ title: "OTP Resent", description: `A new code has been sent to ${email}` });
      } catch (err: any) {
        const statusCode = err.status || "Unknown";
        const message = err.message || "Failed to resend OTP";
        toast({ title: `${statusCode} – Error`, description: message, variant: "destructive" });
      } finally {
        setOtpSending(false);
      }
      return;
    }

    if (pendingVerification?.type === "phone") {
      if (!versionId) return;
      const cc = (formData.countryCode || "").trim();
      const nn = (formData.phoneNumber || "").replace(/\D+/g, "");
      try {
        setOtpSending(true);
        const result = await startPhoneOtp(cc, nn, versionId);
        setPendingVerification((prev) => ({
          ...prev!,
          otpId: result.otpId,
          expiresAt: result.expiresAt,
        }));
        toast({ title: "OTP Resent", description: `A new code has been sent to ${cc} ${nn}` });
      } catch (err: any) {
        const statusCode = err.status || "Unknown";
        const message = err.message || "Failed to resend phone OTP";
        toast({ title: `${statusCode} – Error`, description: message, variant: "destructive" });
      } finally {
        setOtpSending(false);
      }
    }
  };

  const handleOTPClose = () => {
    if (otpType === "email" && !isEmailVerified) return;
    setShowOTPDialog(false);
    setPendingVerification(null);
  };

  const handleConsentClose = () => setShowConsentDialog(false);
  const handleConsentAgree = async () => {
    setHasConsented(true);
    setShowConsentDialog(false);

    const email = (formData.email || "").trim();
    const versionId = getActiveVersionId();

    if (email && versionId != null) {
      try {
        await generateEmailOtp(email, versionId);
        setPendingVerification({ type: "email", recipient: email });
        setOtpType("email");
        setShowOTPDialog(true);
        toast({ title: "OTP Sent", description: `A verification code has been sent to ${email}` });
      } catch (err: any) {
        const statusCode = err.status || "Unknown";
        const message = err.message || "Failed to send OTP";
        toast({ title: `${statusCode} – Error`, description: message, variant: "destructive" });
      }
    }
  };

  // Step 1 dynamic validator
  const isStep1Complete = () => {
    if (!templateVersion) return false;
    const personalInfo: any = getPersonalInfoConfig();
    const requiredToggles = personalInfo?.requiredToggles || {};
    const checks: boolean[] = [];

    if (personalInfo.firstName) checks.push(isValidName(formData.firstName));
    if (personalInfo.lastName) checks.push(isValidName(formData.lastName));

    if (personalInfo.middleName) {
      if (requiredToggles.middleName) {
        checks.push(isValidName(formData.middleName));
      } else if (formData.middleName.trim()) {
        checks.push(isValidName(formData.middleName));
      }
    }

    if (personalInfo.dateOfBirth) {
      if (requiredToggles.dob) {
        checks.push(isValidDOB(formData.dateOfBirth));
      } else if (formData.dateOfBirth) {
        checks.push(isValidDOB(formData.dateOfBirth));
      }
    }

    if (personalInfo.email) {
      checks.push(isValidEmail(formData.email));
      checks.push(BYPASS_OTP_FOR_DEVELOPMENT || isEmailVerified);
    }

    if (personalInfo.phoneNumber) {
      if (requiredToggles.phoneNumber) {
        checks.push(isValidPhoneForCountry(formData.countryCode, formData.phoneNumber));
        checks.push(BYPASS_OTP_FOR_DEVELOPMENT || isPhoneVerified);
      } else if (formData.phoneNumber) {
        checks.push(isValidPhoneForCountry(formData.countryCode, formData.phoneNumber));
        checks.push(BYPASS_OTP_FOR_DEVELOPMENT || isPhoneVerified);
      }
    }

    if (personalInfo.gender && requiredToggles.gender) {
      checks.push(!!formData.gender);
    }

    if (personalInfo.currentAddress) {
      if (requiredToggles.currentAddress) {
        checks.push(isValidAddress(formData.address));
      } else if (formData.address) {
        checks.push(isValidAddress(formData.address));
      }

      if (requiredToggles.currentCity) {
        checks.push(isValidName(formData.city));
      } else if (formData.city) {
        checks.push(isValidName(formData.city));
      }

      if (requiredToggles.currentPostal) {
        checks.push(isValidPostalCode(formData.postalCode));
      } else if (formData.postalCode) {
        checks.push(isValidPostalCode(formData.postalCode));
      }
    }

    if (personalInfo.permanentAddress) {
      if (requiredToggles.permanentAddress) {
        checks.push(isValidAddress(formData.permanentAddress));
      } else if (formData.permanentAddress) {
        checks.push(isValidAddress(formData.permanentAddress));
      }

      if (requiredToggles.permanentCity) {
        checks.push(isValidName(formData.permanentCity));
      } else if (formData.permanentCity) {
        checks.push(isValidName(formData.permanentCity));
      }

      if (requiredToggles.permanentPostal) {
        checks.push(isValidPostalCode(formData.permanentPostalCode));
      } else if (formData.permanentPostalCode) {
        checks.push(isValidPostalCode(formData.permanentPostalCode));
      }
    }

    return checks.length > 0 && checks.every(Boolean);
  };

  const isFormValid = () => {
    if (!templateVersion) {
      console.log('❌ isFormValid: No template version');
      return false;
    }
    const personalInfo: any = getPersonalInfoConfig();
    const requiredToggles = personalInfo?.requiredToggles || {};
    const checks: boolean[] = [];

    if (personalInfo.firstName) checks.push(isValidName(formData.firstName));
    if (personalInfo.lastName) checks.push(isValidName(formData.lastName));

    if (personalInfo.middleName && requiredToggles.middleName) {
      checks.push(isValidName(formData.middleName));
    }

    if (personalInfo.dateOfBirth && requiredToggles.dob) {
      checks.push(isValidDOB(formData.dateOfBirth));
    }

    if (personalInfo.email) {
      checks.push(isValidEmail(formData.email));
      if (!BYPASS_OTP_FOR_DEVELOPMENT) {
        checks.push(isEmailVerified);
      }
    }

    if (personalInfo.phoneNumber && requiredToggles.phoneNumber) {
      checks.push(isValidPhoneForCountry(formData.countryCode, formData.phoneNumber));
      if (!BYPASS_OTP_FOR_DEVELOPMENT) {
        checks.push(isPhoneVerified);
      }
    }

    if (personalInfo.gender && requiredToggles.gender) {
      checks.push(!!formData.gender);
    }

    if (personalInfo.currentAddress) {
      if (requiredToggles.currentAddress) checks.push(isValidAddress(formData.address));
      if (requiredToggles.currentCity) checks.push(isValidName(formData.city));
      if (requiredToggles.currentPostal) checks.push(isValidPostalCode(formData.postalCode));
    }

    if (personalInfo.permanentAddress) {
      if (requiredToggles.permanentAddress) checks.push(isValidAddress(formData.permanentAddress));
      if (requiredToggles.permanentCity) checks.push(isValidName(formData.permanentCity));
      if (requiredToggles.permanentPostal) checks.push(isValidPostalCode(formData.permanentPostalCode));
    }

    const personalOk = checks.length > 0 && checks.every(Boolean);

    const docsSection = templateVersion.sections.find((s) => s.sectionType === "documents");
    const biometricsSection = templateVersion.sections.find((s) => s.sectionType === "biometrics");
    const docsRequired = !!docsSection?.isActive;
    const bioRequired = !!biometricsSection?.isActive;

    console.log('🔍 Form Validation Check:', {
      personalOk,
      docsRequired,
      isIdentityDocumentCompleted,
      bioRequired,
      isSelfieCompleted,
      checks,
      checksLength: checks.length,
      allChecksPass: checks.every(Boolean),
    });

    const isValid = (
      personalOk &&
      (!docsRequired || isIdentityDocumentCompleted) &&
      (!bioRequired || isSelfieCompleted)
    );

    console.log('🔍 Final isFormValid result:', isValid);

    return isValid;
  };

  const getMissingFields = () => {
    if (!templateVersion) return [];

    const personalInfo: any = getPersonalInfoConfig();
    const requiredToggles = personalInfo?.requiredToggles || {};
    const missing: string[] = [];

    if (personalInfo.firstName && !isValidName(formData.firstName)) {
      missing.push("First Name");
    }
    if (personalInfo.lastName && !isValidName(formData.lastName)) {
      missing.push("Last Name");
    }

    if (personalInfo.middleName && requiredToggles.middleName && !isValidName(formData.middleName)) {
      missing.push("Middle Name");
    }

    if (personalInfo.dateOfBirth && requiredToggles.dob && !isValidDOB(formData.dateOfBirth)) {
      missing.push("Date of Birth");
    }

    if (personalInfo.email) {
      if (!isValidEmail(formData.email)) missing.push("Email");
      if (!BYPASS_OTP_FOR_DEVELOPMENT && !isEmailVerified) missing.push("Email Verification");
    }

    if (personalInfo.phoneNumber && requiredToggles.phoneNumber) {
      if (!isValidPhoneForCountry(formData.countryCode, formData.phoneNumber)) {
        missing.push("Phone Number");
      }
      if (!BYPASS_OTP_FOR_DEVELOPMENT && !isPhoneVerified) missing.push("Phone Verification");
    }

    if (personalInfo.gender && requiredToggles.gender && !formData.gender) {
      missing.push("Gender");
    }

    if (personalInfo.currentAddress) {
      if (requiredToggles.currentAddress && !isValidAddress(formData.address)) missing.push("Current Address");
      if (requiredToggles.currentCity && !isValidName(formData.city)) missing.push("Current City");
      if (requiredToggles.currentPostal && !isValidPostalCode(formData.postalCode)) missing.push("Current Postal Code");
    }

    if (personalInfo.permanentAddress) {
      if (requiredToggles.permanentAddress && !isValidAddress(formData.permanentAddress)) missing.push("Permanent Address");
      if (requiredToggles.permanentCity && !isValidName(formData.permanentCity)) missing.push("Permanent City");
      if (requiredToggles.permanentPostal && !isValidPostalCode(formData.permanentPostalCode)) missing.push("Permanent Postal Code");
    }

    const docsSection = templateVersion.sections.find((s) => s.sectionType === "documents");
    if (docsSection?.isActive && !isIdentityDocumentCompleted) {
      missing.push("Identity Documents");
    }

    const biometricsSection = templateVersion.sections.find((s) => s.sectionType === "biometrics");
    if (biometricsSection?.isActive && !isSelfieCompleted) {
      missing.push("Biometric Verification (Selfie)");
    }

    return missing;
  };

  const sectionHasData = (sectionIndex: number) => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const section = sections[sectionIndex - 1];
    if (!section) return false;

    if (section.sectionType === "personalInformation") {
      return !!(
        formData.firstName ||
        formData.lastName ||
        formData.middleName ||
        formData.dateOfBirth ||
        formData.email ||
        formData.phoneNumber ||
        formData.gender ||
        formData.address ||
        formData.city ||
        formData.postalCode ||
        formData.permanentAddress ||
        formData.permanentCity ||
        formData.permanentPostalCode
      );
    } else if (section.sectionType === "documents") {
      return isIdentityDocumentCompleted;
    } else if (section.sectionType === "biometrics") {
      return isSelfieCompleted;
    }
    return false;
  };

  // Step 1: Resolve handoff and get submission data
  useEffect(() => {
    const resolveHandoff = async () => {
      if (!joincode) {
        setError('No join code provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Check if we already resolved this joinCode
        const cachedJoinCode = localStorage.getItem('resolvedJoinCode');
        const cachedSubmissionId = localStorage.getItem('submissionId');
        const cachedAccessToken = localStorage.getItem('access');
        
        if (cachedJoinCode === joincode && cachedSubmissionId && cachedAccessToken) {
          console.log('⚡ Using cached handoff data for joinCode:', joincode);
          
          // Use cached data instead of calling API again
          setSubmissionId(Number(cachedSubmissionId));
          
          // Continue with fetching submission details
          const submissionResponse = await fetch(
            `${API_BASE}/api/UserTemplateSubmissions/${cachedSubmissionId}`,
            {
              method: 'GET',
              headers: { 'accept': 'application/json' }
            }
          );

          if (!submissionResponse.ok) {
            throw new Error('Failed to fetch submission details');
          }

          const submissionData = await submissionResponse.json();
          const templateVersionId = submissionData.templateVersionId;
          const fetchedUserId = submissionData.userId;
          
          setUserId(fetchedUserId);
          localStorage.setItem('userId', fetchedUserId.toString());
          localStorage.setItem('templateVersionId', templateVersionId.toString());

          // Fetch template version
          const templateResponse = await fetch(
            `${API_BASE}/api/TemplateVersion?templateId=${templateVersionId}&page=1&pageSize=50`,
            {
              method: 'GET',
              headers: { 'accept': 'application/json' }
            }
          );

          if (!templateResponse.ok) {
            throw new Error('Failed to fetch template version');
          }

          const templateArray = await templateResponse.json();
          
          if (templateArray && templateArray.length > 0) {
            const template = templateArray[0];
            setTemplateVersion(template);

            // Hydrate form data from cached snapshot
            const cachedSnapshot = localStorage.getItem('handoffSnapshot');
            if (cachedSnapshot) {
              try {
                const snapshot = JSON.parse(cachedSnapshot);
                if (snapshot && snapshot.personalInfoBySection) {
                  Object.values(snapshot.personalInfoBySection).forEach((jsonString: any) => {
                    try {
                      const parsed = JSON.parse(JSON.parse(jsonString));
                      setFormData(prev => ({
                        ...prev,
                        firstName: parsed.firstName || prev.firstName,
                        lastName: parsed.lastName || prev.lastName,
                        middleName: parsed.middleName || prev.middleName,
                        dateOfBirth: parsed.dateOfBirth || prev.dateOfBirth,
                        email: parsed.email || prev.email,
                        countryCode: parsed.countryCode || prev.countryCode,
                        phoneNumber: parsed.phoneNumber || prev.phoneNumber,
                        gender: parsed.gender || prev.gender,
                        address: parsed.address || prev.address,
                        city: parsed.city || prev.city,
                        postalCode: parsed.postalCode || prev.postalCode,
                        permanentAddress: parsed.permanentAddress || prev.permanentAddress,
                        permanentCity: parsed.permanentCity || prev.permanentCity,
                        permanentPostalCode: parsed.permanentPostalCode || prev.permanentPostalCode,
                      }));
                    } catch (e) {
                      console.error('Error parsing cached personal info:', e);
                    }
                  });
                }
              } catch (e) {
                console.error('Error loading cached snapshot:', e);
              }
            }

            toast({
              title: "✅ Session Restored",
              description: "Your verification session has been successfully restored from cache.",
              duration: 5000,
            });

            // Connect to SignalR for real-time file upload notifications
            await connectToSignalR(cachedAccessToken, Number(cachedSubmissionId));
          }

          setLoading(false);
          return;
        }

        // Get mobile device fingerprint for this handoff device (Device 2)
        const handoffDeviceFingerprint = getMobileDeviceFingerprint();
        console.log('🔑 Mobile Device Fingerprint (Device 2 - Handoff):', handoffDeviceFingerprint);
        console.log('🔗 Join Code:', joincode);

        // Call handoff/resolve API (first time only)
        const handoffResponse = await fetch(`${API_BASE}/api/handoff/resolve`, {
          method: 'POST',
          headers: {
            'accept': 'text/plain',
            'X-Device-Fingerprint': handoffDeviceFingerprint,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            joinCode: joincode
          })
        });

        if (!handoffResponse.ok) {
          const errorText = await handoffResponse.text();
          throw new Error(`Failed to resolve handoff: ${errorText}`);
        }

        const handoffData: HandoffResolveResponse = await handoffResponse.json();
        console.log('✅ Handoff Resolved:', handoffData);
        console.log('📱 This is Device 2 (Handoff Device) with fingerprint:', handoffDeviceFingerprint);

        // Save to localStorage (including joinCode for future reference)
        localStorage.setItem('resolvedJoinCode', joincode);
        localStorage.setItem('access', handoffData.accessToken);
        localStorage.setItem('accessToken', handoffData.accessToken);
        localStorage.setItem('submissionId', handoffData.submissionId.toString());
        
        // Store snapshot data for future cached loads
        if (handoffData.snapshot) {
          localStorage.setItem('handoffSnapshot', JSON.stringify(handoffData.snapshot));
        }
        
        setSubmissionId(handoffData.submissionId);

        // Step 2: Fetch submission details
        const submissionResponse = await fetch(
          `${API_BASE}/api/UserTemplateSubmissions/${handoffData.submissionId}`,
          {
            method: 'GET',
            headers: { 'accept': 'application/json' }
          }
        );

        if (!submissionResponse.ok) {
          throw new Error('Failed to fetch submission details');
        }

        const submissionData = await submissionResponse.json();
        console.log('📋 Submission Data:', submissionData);

        const templateVersionId = submissionData.templateVersionId;
        const fetchedUserId = submissionData.userId;
        
        setUserId(fetchedUserId);
        localStorage.setItem('userId', fetchedUserId.toString());
        localStorage.setItem('templateVersionId', templateVersionId.toString());

        // Step 3: Fetch template version
        const templateResponse = await fetch(
          `${API_BASE}/api/TemplateVersion?templateId=${templateVersionId}&page=1&pageSize=50`,
          {
            method: 'GET',
            headers: { 'accept': 'application/json' }
          }
        );

        if (!templateResponse.ok) {
          throw new Error('Failed to fetch template version');
        }

        const templateArray = await templateResponse.json();
        console.log('📄 Template Version:', templateArray);

        if (templateArray && templateArray.length > 0) {
          const template = templateArray[0];
          setTemplateVersion(template);

          // Step 4: Hydrate form data from snapshot
          if (handoffData.snapshot && handoffData.snapshot.personalInfoBySection) {
            Object.values(handoffData.snapshot.personalInfoBySection).forEach((jsonString: any) => {
              try {
                const parsed = JSON.parse(JSON.parse(jsonString));
                setFormData(prev => ({
                  ...prev,
                  firstName: parsed.firstName || prev.firstName,
                  lastName: parsed.lastName || prev.lastName,
                  middleName: parsed.middleName || prev.middleName,
                  dateOfBirth: parsed.dateOfBirth || prev.dateOfBirth,
                  email: parsed.email || prev.email,
                  countryCode: parsed.countryCode || prev.countryCode,
                  phoneNumber: parsed.phoneNumber || prev.phoneNumber,
                  gender: parsed.gender || prev.gender,
                  address: parsed.address || prev.address,
                  city: parsed.city || prev.city,
                  postalCode: parsed.postalCode || prev.postalCode,
                  permanentAddress: parsed.permanentAddress || prev.permanentAddress,
                  permanentCity: parsed.permanentCity || prev.permanentCity,
                  permanentPostalCode: parsed.permanentPostalCode || prev.permanentPostalCode,
                }));
              } catch (e) {
                console.error('Error parsing personal info:', e);
              }
            });
          }

          toast({
            title: "✅ Session Restored",
            description: "Your verification session has been successfully restored. Continue where you left off!",
            duration: 5000,
          });

          // Connect to SignalR for real-time file upload notifications
          await connectToSignalR(handoffData.accessToken, handoffData.submissionId);
        } else {
          throw new Error('No template version found');
        }

      } catch (err) {
        console.error('❌ Error resolving handoff:', err);
        setError(err instanceof Error ? err.message : 'Failed to resolve handoff');
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : 'Failed to load session',
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    resolveHandoff();
  }, [joincode, toast]);

  // Cleanup SignalR connection on unmount
  useEffect(() => {
    return () => {
      if (signalRConnectionRef.current) {
        console.log('🧹 Cleaning up SignalR connection on page unmount');
        signalRConnectionRef.current.stop().catch(err => {
          console.error('Error stopping SignalR connection:', err);
        });
      }
    };
  }, []);

  // Load Personal Information eTag from localStorage when submissionId is available
  useEffect(() => {
    if (submissionId) {
      const savedETag = localStorage.getItem(`personalInfoETag_${submissionId}`);
      if (savedETag) {
        console.log('📦 Loaded Personal Info eTag from localStorage:', savedETag);
        setPersonalInfoETag(savedETag);
      }
    }
  }, [submissionId]);

  // Fetch submission values (documents, etc.)
  useEffect(() => {
    if (!submissionId || !templateVersion) return;

    const fetchSubmissionValues = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/UserTemplateSubmissionValues/submissions/${submissionId}/values`,
          { method: "GET", headers: { Accept: "application/json" } }
        );

        if (!response.ok) {
          console.error("Failed to fetch submission values:", response.status);
          return;
        }

        const submissionValues = await response.json();
        const completedSectionIds = new Set<number>();

        submissionValues.forEach((submission: any) => {
          const section = templateVersion.sections.find(
            (s) => s.id === submission.templateSectionId,
          );
          if (!section) return;

          completedSectionIds.add(submission.templateSectionId);

          try {
            const parsedValue = JSON.parse(submission.fieldValue);

            // Extract and store eTag for Personal Information section
            if (section.sectionType === "personalInformation" && submission.eTag) {
              const cleanedETag = submission.eTag.replace(/^W\/"|"$/g, '');
              console.log('📦 Extracted Personal Info eTag from GET:', submission.eTag);
              console.log('📦 Cleaned eTag:', cleanedETag);
              setPersonalInfoETag(cleanedETag);
              localStorage.setItem(`personalInfoETag_${submissionId}`, cleanedETag);
            }

            if (section.sectionType === "documents" && parsedValue) {
              const documentsArray = parsedValue.documents || [];
              const uploadedDocIds: string[] = [];
              const rebuiltDocumentUploadIds: Record<string, { front?: number; back?: number }> = {};

              documentsArray.forEach((doc: any) => {
                const docName = doc.documentName;
                const docId = docName.toLowerCase().replace(/\s+/g, "_");
                uploadedDocIds.push(docId);
                rebuiltDocumentUploadIds[docId] = {
                  front: doc.frontFileId,
                  ...(doc.backFileId && { back: doc.backFileId }),
                };
              });

              setDocumentFormState((prev) => ({
                ...prev,
                country: parsedValue.country || prev.country,
                uploadedDocuments: uploadedDocIds,
                documentUploadIds: rebuiltDocumentUploadIds,
                documentsDetails: documentsArray,
              }));

              if (documentsArray.length > 0) {
                setIsIdentityDocumentCompleted(true);
              }
            }

            if (section.sectionType === "biometrics" && parsedValue) {
              setBiometricFormState((prev) => ({
                ...prev,
                capturedImage: parsedValue.capturedImage || prev.capturedImage,
                isImageCaptured: parsedValue.isImageCaptured || prev.isImageCaptured,
              }));
              if (parsedValue.isImageCaptured) {
                setIsSelfieCompleted(true);
              }
            }
          } catch (parseError) {
            console.error("Error parsing fieldValue for section:", section.sectionType, parseError);
          }
        });

        const sections = templateVersion.sections
          .filter((s) => s.isActive)
          .sort((a, b) => a.orderIndex - b.orderIndex);

        const newCompletedSections: Record<number, boolean> = {};
        sections.forEach((section, index) => {
          const sectionIndex = index + 1;
          if (completedSectionIds.has(section.id)) {
            newCompletedSections[sectionIndex] = true;
          }
        });
        setCompletedSections(newCompletedSections);
      } catch (error) {
        console.error("Error fetching submission values:", error);
      }
    };

    fetchSubmissionValues();
  }, [submissionId, templateVersion]);

  // Welcome back toast and expand logic
  useEffect(() => {
    if (!templateVersion || Object.keys(completedSections).length === 0) return;
    if (hasShownWelcomeBackToast) return;

    const hasAnyCompletedSections = Object.values(completedSections).some(Boolean);
    if (!hasAnyCompletedSections) return;

    const sections = templateVersion.sections
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const completedSectionNames: string[] = [];
    let firstIncompleteSection: number | null = null;
    const sectionsToExpand: Record<number, boolean> = {};

    sections.forEach((section, index) => {
      const sectionIndex = index + 1;
      if (completedSections[sectionIndex]) {
        completedSectionNames.push(section.name);
      } else if (firstIncompleteSection === null) {
        firstIncompleteSection = sectionIndex;
      }
    });

    if (completedSectionNames.length > 0) {
      const completedCount = completedSectionNames.length;
      const totalCount = sections.length;

      const targetSection = firstIncompleteSection || sections.length;
      setCurrentStep(targetSection);
      setExpandedSections(sectionsToExpand);

      setTimeout(() => {
        setHasShownWelcomeBackToast(true);
        toast({
          title: `👋 Welcome back!`,
          description: `You've completed ${completedCount} of ${totalCount} sections. ${
            firstIncompleteSection ? "Continue with the next section." : "All sections complete!"
          }`,
          duration: 5000,
        });
      }, 500);
    }
  }, [completedSections, templateVersion, hasShownWelcomeBackToast, toast]);

  // Auto-mark step 1 as complete
  useEffect(() => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const ok = isStep1Complete();
    if (ok && !completedSections[1] && sections[0]) {
      setCompletedSections((prev) => ({ ...prev, 1: true }));
      postSectionData(sections[0]);

      if (!hasShownStep1Toast) {
        setHasShownStep1Toast(true);

        const nextIndex = 2;
        if (nextIndex <= sections.length) {
          setTimeout(() => {
            setCurrentStep(nextIndex);
            setExpandedSections((prev) => ({
              ...prev,
              1: false,
              [nextIndex]: true,
            }));
            toast({
              title: "✅ Personal Information Complete",
              description: "Great job! Moving to the next section...",
              duration: 3000,
            });
          }, 500);
        }
      }
    }
  }, [
    templateVersion,
    isEmailVerified,
    isPhoneVerified,
    formData.firstName,
    formData.lastName,
    formData.middleName,
    formData.dateOfBirth,
    formData.email,
    formData.countryCode,
    formData.phoneNumber,
    formData.address,
    formData.city,
    formData.postalCode,
    formData.permanentAddress,
    formData.permanentCity,
    formData.permanentPostalCode,
    isIdentityDocumentCompleted,
    isSelfieCompleted,
    currentStep,
    hasShownStep1Toast,
    completedSections,
    toast,
  ]);

  // Advance to step 3 when docs complete
  useEffect(() => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (currentStep === 2 && isIdentityDocumentCompleted && !hasShownStep2Toast) {
      setHasShownStep2Toast(true);

      const documentsSectionIndex = sections.findIndex(s => s.sectionType === "documents") + 1;
      const isLastSection = documentsSectionIndex === sections.length;

      if (isLastSection) {
        toast({
          title: "🎉 All Sections Complete!",
          description: "Your documents are uploaded. Click Submit to finish your verification.",
          duration: 5000,
        });
      } else {
        const nextSectionIndex = documentsSectionIndex + 1;
        setTimeout(() => {
          setCurrentStep(nextSectionIndex);
          setExpandedSections((prev) => ({
            ...prev,
            [documentsSectionIndex]: false,
            [nextSectionIndex]: true,
          }));
          toast({
            title: "✅ Documents Complete",
            description: "Moving to the next section...",
            duration: 3000,
          });
        }, 1000);
      }
    }
  }, [templateVersion, currentStep, isIdentityDocumentCompleted, hasShownStep2Toast, completedSections, toast]);

  // Determine next step dynamically
  useEffect(() => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    if (sections.length === 0) return;

    const isSectionComplete = (type: string) => {
      if (type === "personalInformation") return isStep1Complete();
      if (type === "documents") return isIdentityDocumentCompleted;
      if (type === "biometrics") return isSelfieCompleted;
      return false;
    };

    const firstIncompleteIdx = sections.findIndex(
      (s) => !isSectionComplete(s.sectionType as string),
    );
    const nextStep =
      firstIncompleteIdx === -1 ? sections.length : firstIncompleteIdx + 1;

    if (nextStep !== currentStep) {
      setCurrentStep(nextStep);
    }
  }, [
    templateVersion,
    isEmailVerified,
    isPhoneVerified,
    formData.firstName,
    formData.lastName,
    formData.middleName,
    formData.dateOfBirth,
    formData.email,
    formData.countryCode,
    formData.phoneNumber,
    formData.address,
    formData.city,
    formData.postalCode,
    formData.permanentAddress,
    formData.permanentCity,
    formData.permanentPostalCode,
    isIdentityDocumentCompleted,
    isSelfieCompleted,
  ]);

  // Auto-expand current step and close mobile menu
  useEffect(() => {
    setExpandedSections(prev => ({ ...prev, [currentStep]: true }));
    if (currentStep >= 2) setShowMobileMenu(false);
  }, [currentStep]);

  const postSectionData = async (section: any) => {
    if (!templateVersion || !userId || !submissionId) return;
    
    // Special handling for Personal Information section - use PUT with eTag
    if (section.sectionType === "personalInformation") {
      const personalInfo = getPersonalInfoConfig();
      const mappedData: any = {};
      if (personalInfo.firstName) mappedData.firstName = formData.firstName;
      if (personalInfo.lastName) mappedData.lastName = formData.lastName;
      if (personalInfo.middleName) mappedData.middleName = formData.middleName;
      if (personalInfo.dateOfBirth) mappedData.dateOfBirth = formData.dateOfBirth;
      if (personalInfo.email) mappedData.email = formData.email;
      if (personalInfo.phoneNumber) {
        mappedData.countryCode = formData.countryCode;
        mappedData.phoneNumber = formData.phoneNumber;
      }
      if (personalInfo.gender) mappedData.gender = formData.gender;
      if (personalInfo.currentAddress) {
        mappedData.address = formData.address;
        mappedData.city = formData.city;
        mappedData.postalCode = formData.postalCode;
      }
      if (personalInfo.permanentAddress) {
        mappedData.permanentAddress = formData.permanentAddress;
        mappedData.permanentCity = formData.permanentCity;
        mappedData.permanentPostalCode = formData.permanentPostalCode;
      }
      
      const fieldValueJson = JSON.stringify(mappedData);
      const deviceFingerprint = getMobileDeviceFingerprint();
      const token = getToken();
      
      try {
        console.log('🔄 PUT Personal Information with eTag:', personalInfoETag);
        const response = await fetch(
          `${API_BASE}/api/personal-info/${submissionId}/${section.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Accept": "text/plain",
              "If-Match": personalInfoETag,
              "X-Device-Fingerprint": deviceFingerprint,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ fieldValueJson }),
          }
        );
        
        if (!response.ok) {
          throw new Error(`PUT failed: ${response.statusText}`);
        }
        
        // Extract new eTag from response headers or body
        let newETag: string | null = null;
        
        // First try to get eTag from response headers
        const eTagHeader = response.headers.get('etag') || response.headers.get('ETag');
        if (eTagHeader) {
          newETag = eTagHeader;
          console.log('📥 Received eTag from headers:', eTagHeader);
        } else {
          // Fallback: try to parse from response body
          try {
            const responseText = await response.text();
            const responseData = JSON.parse(responseText);
            newETag = responseData?.eTag || null;
            console.log('📥 Received eTag from body:', newETag);
          } catch (e) {
            console.warn('Could not parse PUT response:', e);
          }
        }
        
        // Update eTag if we got a new one
        if (newETag) {
          // Clean eTag format: remove W/"" wrapper if present
          // Example: W/"+NPEw6bCX0e4AGuC/u8s8g==" becomes +NPEw6bCX0e4AGuC/u8s8g==
          const cleanedETag = newETag.replace(/^W\/"|"$/g, '');
          console.log('✅ Cleaned eTag for storage/next request:', cleanedETag);
          setPersonalInfoETag(cleanedETag);
          // Save cleaned eTag to localStorage for persistence
          if (submissionId) {
            localStorage.setItem(`personalInfoETag_${submissionId}`, cleanedETag);
          }
        }
        
        console.log('✅ Personal Information saved successfully');
      } catch (err) {
        console.error("Failed to PUT personal information section", err);
      }
      return;
    }
    
    // For other sections (documents, biometrics) - use POST as before
    let fieldValue = "";
    if (section.sectionType === "documents") {
      console.log('📤 Posting documents data:', {
        country: documentFormState.country,
        documentsDetails: documentFormState.documentsDetails,
      });
      const documentData = {
        country: documentFormState.country,
        documents: documentFormState.documentsDetails,
      };
      fieldValue = JSON.stringify(documentData);
      console.log('📤 Documents fieldValue:', fieldValue);
    } else if (section.sectionType === "biometrics") {
      fieldValue = JSON.stringify({
        selfieUploaded: isSelfieCompleted,
        completedAt: new Date().toISOString(),
      });
    }
    
    try {
      await fetch(
        `${API_BASE}/api/UserTemplateSubmissionValues/${submissionId}/${section.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "*/*",
          },
          body: JSON.stringify({ fieldValue }),
        }
      );
    } catch (err) {
      console.error("Failed to POST section data", err);
    }
  };

  const handleSectionFocus = async (newSectionIndex: number) => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (activeSectionIndex !== newSectionIndex && activeSectionIndex > 0) {
      const previousSection = sections[activeSectionIndex - 1];
      if (previousSection && sectionHasData(activeSectionIndex)) {
        await postSectionData(previousSection);
        toast({
          title: "Progress Saved",
          description: "Your progress has been automatically saved.",
          duration: 2000,
        });
      }
    }

    setActiveSectionIndex(newSectionIndex);
  };

  const handleSectionComplete = async (sectionIndex: number, section: any) => {
    setCompletedSections((prev) => ({ ...prev, [sectionIndex]: true }));
    await postSectionData(section);

    const isLastSection = sectionIndex === activeSections.length;

    if (section.sectionType === "personalInformation") {
      if (isLastSection) {
        toast({
          title: "🎉 All Sections Complete!",
          description: "You've completed all required sections. Click Submit to finish.",
          duration: 5000,
        });
      } else {
        const nextSectionIndex = sectionIndex + 1;
        setCurrentStep(nextSectionIndex);
        setExpandedSections((prev) => ({
          ...prev,
          [sectionIndex]: false,
          [nextSectionIndex]: true,
        }));
        toast({
          title: "✅ Personal Information Complete",
          description: "Moving to the next section...",
          duration: 3000,
        });
      }
    } else {
      if (isLastSection) {
        toast({
          title: "🎉 All Sections Complete!",
          description: "You've completed all required sections. Click Submit to finish.",
          duration: 5000,
        });
      } else {
        const nextSectionIndex = sectionIndex + 1;
        setCurrentStep(nextSectionIndex);
        setExpandedSections((prev) => ({
          ...prev,
          [sectionIndex]: false,
          [nextSectionIndex]: true,
        }));
        toast({
          title: "✅ Section Complete",
          description: "Moving to the next section...",
          duration: 3000,
        });
      }
    }
  };

  const handleIdentityDocumentComplete = () => {
    setIsIdentityDocumentCompleted(true);
    
    const documentsSection = activeSections.find(s => s.sectionType === "documents");
    const documentsSectionIndex = activeSections.findIndex(s => s.sectionType === "documents") + 1;

    setCompletedSections((prev) => ({ ...prev, [documentsSectionIndex]: true }));

    if (documentsSection) {
      postSectionData(documentsSection);
    }

    const isLastSection = documentsSectionIndex === activeSections.length;

    if (!hasShownStep2Toast) {
      setHasShownStep2Toast(true);

      if (isLastSection) {
        toast({
          title: "🎉 Documents Complete!",
          description: "All sections are now complete. Click Submit to finish your verification.",
          duration: 5000,
        });
      } else {
        toast({
          title: "✅ Documents Uploaded",
          description: "Your documents have been successfully uploaded.",
          duration: 3000,
        });
      }
    }

    if (!isLastSection) {
      const nextSectionIndex = documentsSectionIndex + 1;
      setTimeout(() => {
        setCurrentStep(nextSectionIndex);
        setExpandedSections((prev) => ({
          ...prev,
          [documentsSectionIndex]: false,
          [nextSectionIndex]: true,
        }));
      }, 1000);
    }
  };

  const handleSelfieComplete = () => {
    setIsSelfieCompleted(true);

    const biometricsSection = activeSections.find(s => s.sectionType === "biometrics");
    const biometricsSectionIndex = activeSections.findIndex(s => s.sectionType === "biometrics") + 1;

    setCompletedSections((prev) => ({ ...prev, [biometricsSectionIndex]: true }));

    if (biometricsSection) {
      postSectionData(biometricsSection);
    }

    const isLastSection = biometricsSectionIndex === activeSections.length;

    if (isLastSection) {
      toast({
        title: "🎉 All Sections Complete!",
        description: "Your biometric verification is complete. Click Submit to finish.",
        duration: 5000,
      });
    } else {
      const nextSectionIndex = biometricsSectionIndex + 1;
      toast({
        title: "✅ Selfie Captured",
        description: "Your selfie has been successfully captured. Moving to the next section...",
        duration: 3000,
      });
      setTimeout(() => {
        setCurrentStep(nextSectionIndex);
        setExpandedSections((prev) => ({
          ...prev,
          [biometricsSectionIndex]: false,
          [nextSectionIndex]: true,
        }));
      }, 1000);
    }
  };

  const handleDocumentUploaded = async () => {
    console.log('🔔 handleDocumentUploaded called!');
    console.log('📋 Current documentFormState:', documentFormState);
    const documentsSection = activeSections.find(s => s.sectionType === "documents");
    if (documentsSection) {
      console.log('📄 Found documents section, calling postSectionData...');
      await postSectionData(documentsSection);
    } else {
      console.log('❌ No documents section found!');
    }
  };

  const toggleSection = async (idx: number) => {
    if (idx > currentStep) {
      toast({
        title: "Step locked",
        description: "Complete the current step to continue.",
        variant: "destructive",
      });
      return;
    }

    setExpandedSections(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const handleSubmit = async () => {
    console.log('🚀 Submit button clicked!');
    console.log('📊 Current State:', {
      isIdentityDocumentCompleted,
      isSelfieCompleted,
      documentsDetails: documentFormState.documentsDetails,
      formData,
    });

    if (!isFormValid()) {
      const missing = getMissingFields();
      console.log('❌ Form validation failed. Missing fields:', missing);
      toast({
        title: "❌ Form Incomplete",
        description: missing.length > 0 
          ? `Please complete: ${missing.join(", ")}`
          : "Please complete all required fields before submitting.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    console.log('✅ Form validation passed!');

    if (!userId || !templateVersion || !submissionId) {
      console.log('❌ Missing required data:', { userId, templateVersion: !!templateVersion, submissionId });
      toast({
        title: "❌ Error",
        description: "Missing required data. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    // Clear handoff cache
    localStorage.removeItem('resolvedJoinCode');
    localStorage.removeItem('handoffSnapshot');

    toast({
      title: "🎉 Verification Complete!",
      description: "Your identity verification has been submitted successfully.",
      duration: 3000,
    });

    // Navigate to success page
    navigate("/verification-success");
  };

  const activeSections = (templateVersion?.sections || [])
    .filter((s) => s.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-800">Loading...</h1>
          <p className="text-gray-600 mt-2">Restoring your session</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-lg">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Error</h1>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!templateVersion || activeSections.length === 0) {
    return (
      <div className="w-full h-screen bg-page-background flex items-center justify-center">
        <div className="text-destructive font-roboto text-lg">
          No template data available
        </div>
      </div>
    );
  }

  return (
    <>
      <ConsentDialog
        isOpen={showConsentDialog && !hasConsented}
        onClose={handleConsentClose}
        onAgree={handleConsentAgree}
      />

      <HowItWorksDialog
        isOpen={showHowItWorksDialog}
        onClose={() => setShowHowItWorksDialog(false)}
      />

      <OTPVerificationDialog
        isOpen={showOTPDialog}
        onClose={handleOTPClose}
        onVerify={handleOTPVerify}
        onResend={handleOTPResend}
        type={otpType}
        recipientEmail={otpType === "email" ? formData.email : undefined}
        nonDismissable={true}
        recipientPhone={
          otpType === "phone"
            ? `${formData.countryCode} ${formData.phoneNumber}`
            : undefined
        }
      />

      <div className="w-full min-h-screen bg-page-background flex flex-col">
        <Header
          onMobileMenuToggle={() => setShowMobileMenu((v) => !v)}
          isMobileMenuOpen={showMobileMenu}
        />

        <div className="flex w-full h-11 items-center flex-shrink-0 bg-background border-b border-border">
          <div className="flex flex-col items-start flex-1 px-3 sm:px-4">
            <div className="flex h-11 justify-between items-center self-stretch">
              <div className="flex items-center gap-1">
                <div className="text-text-primary font-roboto text-base font-bold leading-3">
                  Identity Verification Form
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSubmit}
                  className="flex h-8 py-[9px] px-3 justify-center items-center gap-0.5 rounded bg-primary"
                >
                  <span className="text-white font-roboto text-[13px] font-normal">
                    Submit
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-1 overflow-hidden">
          <div className="hidden lg:block border-r border-border">
            <StepSidebar sections={activeSections} currentStep={currentStep} />
          </div>

          {showMobileMenu && (
            <div className="lg:hidden fixed inset-0 z-50 flex">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowMobileMenu(false)}
                aria-hidden
              />
              <div className="relative w-80 bg-white h-full border-r border-border shadow-lg overflow-auto">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="font-roboto font-bold">Steps</div>
                  <button
                    aria-label="Close menu"
                    className="p-1"
                    onClick={() => setShowMobileMenu(false)}
                  >
                    ✕
                  </button>
                </div>
                <StepSidebar
                  sections={activeSections}
                  currentStep={currentStep}
                />
              </div>
            </div>
          )}

          <div className="flex w-full flex-1 flex-col">
            <div className="lg:hidden px-3 py-4 bg-page-background">
              <div className="space-y-4">
                {activeSections.map((section, index) => (
                  <DynamicSection
                    key={section.id}
                    section={section}
                    sectionIndex={index + 1}
                    currentStep={currentStep}
                    isExpanded={!!expandedSections[index + 1]}
                    onToggle={toggleSection}
                    onSectionFocus={handleSectionFocus}
                    formData={formData}
                    setFormData={setFormData}
                    isEmailVerified={isEmailVerified}
                    isPhoneVerified={isPhoneVerified}
                    onSendEmailOTP={handleSendEmailOTP}
                    onSendPhoneOTP={handleSendPhoneOTP}
                    onIdentityDocumentComplete={handleIdentityDocumentComplete}
                    onSelfieComplete={handleSelfieComplete}
                    submissionId={submissionId}
                    shortCode={undefined}
                    templateVersionId={templateVersion?.versionId}
                    userId={userId}
                    isFilled={!!completedSections[index + 1]}
                    documentFormState={documentFormState}
                    setDocumentFormState={setDocumentFormState}
                    onDocumentUploaded={handleDocumentUploaded}
                    biometricFormState={biometricFormState}
                    setBiometricFormState={setBiometricFormState}
                    emailLocked={emailLocked}
                  />
                ))}
              </div>
            </div>

            <div className="hidden lg:flex w-full flex-1 p-6 flex-col items-center gap-6 bg-background overflow-auto">
              <div className="flex w-full max-w-[998px] flex-col items-center gap-6">
                <div className="flex flex-col items-center gap-6 self-stretch">
                  {activeSections.map((section, index) => (
                    <DesktopDynamicSection
                      key={section.id}
                      section={section}
                      sectionIndex={index + 1}
                      currentStep={currentStep}
                      onSectionFocus={handleSectionFocus}
                      formData={formData}
                      setFormData={setFormData}
                      isEmailVerified={isEmailVerified}
                      isPhoneVerified={isPhoneVerified}
                      onSendEmailOTP={handleSendEmailOTP}
                      onSendPhoneOTP={handleSendPhoneOTP}
                      onIdentityDocumentComplete={handleIdentityDocumentComplete}
                      onSelfieComplete={handleSelfieComplete}
                      submissionId={submissionId}
                      shortCode={undefined}
                      templateVersionId={templateVersion?.versionId}
                      userId={userId}
                      isFilled={!!completedSections[index + 1]}
                      isExpanded={!!expandedSections[index + 1]}
                      onToggle={toggleSection}
                      documentFormState={documentFormState}
                      setDocumentFormState={setDocumentFormState}
                      onDocumentUploaded={handleDocumentUploaded}
                      biometricFormState={biometricFormState}
                      setBiometricFormState={setBiometricFormState}
                      emailLocked={emailLocked}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
