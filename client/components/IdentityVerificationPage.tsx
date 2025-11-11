import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "./Header";
import { StepSidebar } from "./StepSidebar";
import { ConsentDialog } from "./ConsentDialog";
import { HowItWorksDialog } from "./HowItWorksDialog";
import { DynamicSection } from "./DynamicSection";
import { DesktopDynamicSection } from "./DesktopDynamicSection";
import { OTPVerificationDialog } from "./OTPVerificationDialog";
import { QRCodeDisplay } from "./QRCodeDisplay";
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
import { getDesktopDeviceFingerprint } from "@/lib/deviceFingerprint";

// ---- single source of truth for API base ----
const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || "";

// 🚀 DEVELOPMENT FLAG - bypass OTP correctness but STILL hit backend
const BYPASS_OTP_FOR_DEVELOPMENT = true;

// token helper
const getToken = () =>
  (typeof window !== "undefined" && localStorage.getItem("access")) || null;

interface IdentityVerificationPageProps {
  // NOTE: we call /TemplateVersion/{id} so this is a VERSION id
  templateId: number;
  userId: number | null;
  shortCode: string;
}

export function IdentityVerificationPage({
  templateId,
  userId,
  shortCode,
}: IdentityVerificationPageProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [templateVersion, setTemplateVersion] =
    useState<TemplateVersionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [hasShownStep1Toast, setHasShownStep1Toast] = useState(false);
  const [isIdentityDocumentCompleted, setIsIdentityDocumentCompleted] =
    useState(false);
  const [hasShownStep2Toast, setHasShownStep2Toast] = useState(false);
  const [hasShownWelcomeBackToast, setHasShownWelcomeBackToast] = useState(false);
  const [isSelfieCompleted, setIsSelfieCompleted] = useState(false);

  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [showHowItWorksDialog, setShowHowItWorksDialog] = useState(false);

  // shortCode resolve + OTP states
  const [linkResolveLoading, setLinkResolveLoading] = useState(true);
  const [resolvedTemplateVersionId, setResolvedTemplateVersionId] = useState<number | null>(null);
  const [emailLocked, setEmailLocked] = useState(false);

  // sections/ui state
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

  // eTag for Personal Information section (for optimistic concurrency control with PUT)
  const [personalInfoETag, setPersonalInfoETag] = useState<string>("AAAAAAAAAAAAAAAAAAAAAA==");

  // Ref to control SignalR connection lifecycle
  const signalRConnectionRef = useRef<any>(null);
  const shouldMaintainConnection = useRef(true);

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

  // Document state
  const [documentFormState, setDocumentFormState] = useState({
    country: "",
    selectedDocument: "",
    uploadedDocuments: [] as string[],
    uploadedFiles: [] as Array<{id: string, name: string, size: string, type: string}>,
    documentUploadIds: {} as Record<string, { front?: number; back?: number }>,
    documentsDetails: [] as Array<{
      documentName: string;
      documentDefinitionId: number;
      frontFileId: number;
      backFileId?: number;
      status: "uploaded" | "pending";
      uploadedAt: string;
    }>,
  });

  const setDocumentFormStateWithLogging = (newState: any) => {
    setDocumentFormState(newState);
  };

  // Biometric state
  const [biometricFormState, setBiometricFormState] = useState({
    capturedImage: null as string | null,
    isImageCaptured: false,
  });

  // helpers
  const getPersonalInfoConfig = () => {
    if (!templateVersion) return {};
    const personalInfoSection = templateVersion.sections.find(
      (section) => section.sectionType === "personalInformation",
    );
    if (
      !personalInfoSection ||
      !personalInfoSection.fieldMappings?.[0]?.structure
    ) {
      return {};
    }
    const fieldConfig = personalInfoSection.fieldMappings[0].structure as any;
    return fieldConfig.personalInfo || {};
  };

  // resolve shortCode → prefill email → (after consent) send OTP
  useEffect(() => {
    if (!shortCode) {
      setLinkResolveLoading(false);
      return;
    }

    const controller = new AbortController();
    (async () => {
      try {
        setLinkResolveLoading(true);
        const res = await fetch(
          `${API_BASE}/api/templates-link-generation/resolve?shortCode=${encodeURIComponent(shortCode)}`,
          { headers: { Accept: "application/json" }, signal: controller.signal }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to resolve link");
        }
        const data = await res.json();

        setResolvedTemplateVersionId(data?.templateVersionId ?? null);

        // Prefill email from link (if present)
        if (data?.user?.email) {
          setFormData((prev) => ({ ...prev, email: data.user.email }));
        }
      } catch (e: any) {
        // If the fetch was aborted due to the component unmounting or
        // dependency change, the error will typically be an AbortError.
        // That's expected during cleanup, so don't show a destructive toast
        // for that case (it produces messages like "signal is aborted without reason").
        if (e?.name === "AbortError") {
          // silent abort
        } else {
          toast({
            title: "Invalid or expired link",
            description: e?.message || "Could not resolve your link.",
            variant: "destructive",
          });
        }
      } finally {
        setLinkResolveLoading(false);
      }
    })();

    return () => controller.abort();
  }, [shortCode, API_BASE, toast]);

  // DigiLocker: optionally skip consent
  useEffect(() => {
    const digilockerAuthCode = sessionStorage.getItem("digilocker_auth_code");
    const skipConsent = sessionStorage.getItem("digilocker_skip_consent");
    const isDigilockerReturn = !!digilockerAuthCode || !!skipConsent;

    if (isDigilockerReturn) {
      setHasConsented(true);
      sessionStorage.removeItem("digilocker_skip_consent");
    } else {
      setShowConsentDialog(true);
    }
  }, []);

  // prefer resolved version id when fetching
  const effectiveTemplateVersionId = resolvedTemplateVersionId ?? templateId;

  // fetch TemplateVersion by id
  useEffect(() => {
    if (!effectiveTemplateVersionId) {
      setError("No template/version ID provided");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE}/api/TemplateVersion/${effectiveTemplateVersionId}`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to fetch version ${effectiveTemplateVersionId}`);
        }
        const data: TemplateVersionResponse = await res.json();
        setTemplateVersion(data);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          setError(e?.message || "Failed to load template version");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [effectiveTemplateVersionId, API_BASE]);

  // create (or reuse) submission
  useEffect(() => {
    const createUserTemplateSubmission = async () => {
      if (!templateVersion || !userId || submissionId) return;

      try {
        // try reuse
        const checkResponse = await fetch(
          `${API_BASE}/api/UserTemplateSubmissions?TemplateVersionId=${templateVersion.versionId}&UserId=${userId}`,
          { method: "GET", headers: { Accept: "application/json" } }
        );

        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          if (checkData.items && checkData.items.length > 0) {
            const existingSubmission = checkData.items[0];
            setSubmissionId(existingSubmission.id);
            // Store submissionId in localStorage
            localStorage.setItem('submissionId', existingSubmission.id.toString());
            return;
          }
        }

        // create new
        const submissionResponse = await fetch(
          `${API_BASE}/api/UserTemplateSubmissions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              templateVersionId: templateVersion.versionId,
              userId: userId,
            }),
          },
        );

        if (!submissionResponse.ok) {
          throw new Error("Failed to create template submission");
        }

        const submissionData = await submissionResponse.json();
        setSubmissionId(submissionData.id);
        // Store submissionId in localStorage
        localStorage.setItem('submissionId', submissionData.id.toString());
      } catch (error) {
        console.error("Error with UserTemplateSubmission:", error);
        toast({
          title: "Initialization Error",
          description: "Failed to initialize form submission. Please refresh and try again.",
          variant: "destructive",
        });
      }
    };

    if (templateVersion && userId && !submissionId) {
      createUserTemplateSubmission();
    }
  }, [templateVersion, userId, submissionId, API_BASE, toast]);

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

  // fetch and hydrate submission values
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

            if (section.sectionType === "personalInformation") {
              setFormData((prev) => ({
                ...prev,
                firstName: parsedValue.firstName ?? prev.firstName,
                lastName: parsedValue.lastName ?? prev.lastName,
                middleName: parsedValue.middleName ?? prev.middleName,
                dateOfBirth: parsedValue.dateOfBirth ?? prev.dateOfBirth,
                email: parsedValue.email ?? prev.email,
                countryCode: parsedValue.countryCode ?? prev.countryCode,
                phoneNumber: parsedValue.phoneNumber ?? prev.phoneNumber,
                gender: parsedValue.gender ?? prev.gender,
                address: parsedValue.address ?? prev.address,
                city: parsedValue.city ?? prev.city,
                postalCode: parsedValue.postalCode ?? prev.postalCode,
                permanentAddress: parsedValue.permanentAddress ?? prev.permanentAddress,
                permanentCity: parsedValue.permanentCity ?? prev.permanentCity,
                permanentPostalCode: parsedValue.permanentPostalCode ?? prev.permanentPostalCode,
              }));
              
              // Extract and store eTag for Personal Information section
              if (submission.eTag) {
                const cleanedETag = submission.eTag.replace(/^W\/"|"$/g, '');
                console.log('📦 Extracted Personal Info eTag from GET:', submission.eTag);
                console.log('📦 Cleaned eTag:', cleanedETag);
                setPersonalInfoETag(cleanedETag);
                localStorage.setItem(`personalInfoETag_${submissionId}`, cleanedETag);
              }
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
  }, [submissionId, templateVersion, API_BASE]);

  // welcome back toast and expand logic
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
        sectionsToExpand[sectionIndex] = true;
      } else if (firstIncompleteSection === null) {
        firstIncompleteSection = sectionIndex;
        sectionsToExpand[sectionIndex] = true;
      }
    });

    if (completedSectionNames.length > 0) {
      const completedCount = completedSectionNames.length;
      const totalCount = sections.length;

      const targetSection = firstIncompleteSection || sections.length;
      setCurrentStep(targetSection);
      setExpandedSections(sectionsToExpand);

      setTimeout(() => {
        const nextSectionName = firstIncompleteSection
          ? sections[firstIncompleteSection - 1]?.name
          : null;

        toast({
          title: "🎉 Welcome Back!",
          description: `You've already completed ${completedCount}/${totalCount} section${completedCount > 1 ? 's' : ''}: ${completedSectionNames.join(', ')}${
            nextSectionName ? `. Continue with ${nextSectionName}.` : ''
          }`,
          duration: 6000,
        });
        setHasShownWelcomeBackToast(true);
      }, 500);
    }
  }, [completedSections, templateVersion, hasShownWelcomeBackToast, toast]);

  // POST section data helper
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
      const deviceFingerprint = getDesktopDeviceFingerprint();
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
      const documentData = {
        country: documentFormState.country,
        documents: documentFormState.documentsDetails,
      };
      fieldValue = JSON.stringify(documentData);
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

  // Section change autosave
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
          description: `Your ${previousSection.name.toLowerCase()} data has been saved.`,
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
          title: "🎉 Verification Complete!",
          description: "All sections have been completed successfully. Your identity verification is now complete.",
          duration: 5000,
        });
      } else {
        toast({
          title: `✅ ${section.name || 'Personal Information'} Completed`,
          description: "Your personal information has been saved. Moving to the next section...",
          duration: 3000,
        });

        setTimeout(() => {
          const nextSectionIndex = sectionIndex + 1;
          if (nextSectionIndex <= activeSections.length) {
            setCurrentStep(nextSectionIndex);
            setExpandedSections(prev => ({ ...prev, [nextSectionIndex]: true }));
            const nextSection = activeSections[nextSectionIndex - 1];
            toast({
              title: `📋 ${nextSection?.name || 'Next Section'}`,
              description: `Please complete the ${nextSection?.name?.toLowerCase() || 'next section'}.`,
              duration: 4000,
            });
          }
        }, 2000);
      }
    } else {
      if (isLastSection) {
        toast({
          title: "🎉 Verification Complete!",
          description: "All sections have been completed successfully. Your identity verification is now complete.",
          duration: 5000,
        });
      } else {
        toast({
          title: `✅ ${section.name || 'Section'} Completed`,
          description: "This section has been successfully completed. Moving to the next section...",
          duration: 3000,
        });

        setTimeout(() => {
          const nextSectionIndex = sectionIndex + 1;
          if (nextSectionIndex <= activeSections.length) {
            setCurrentStep(nextSectionIndex);
            setExpandedSections(prev => ({ ...prev, [nextSectionIndex]: true }));
            const nextSection = activeSections[nextSectionIndex - 1];
            toast({
              title: `📋 ${nextSection?.name || 'Next Section'}`,
              description: `Please complete the ${nextSection?.name?.toLowerCase() || 'next section'}.`,
              duration: 4000,
            });
          }
        }, 2000);
      }
    }
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

    // ensure we have a submissionId and versionId - the backend requires both
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

    // return parsed JSON if needed by caller (e.g., issued token information)
    const bodyText = await res.text().catch(() => "");
    try {
      return bodyText ? JSON.parse(bodyText) : null;
    } catch (e) {
      return null;
    }
  }

  // Send a session heartbeat to backend. Uses stored access token and a per-device
  // fingerprint header. The fingerprint is persisted to localStorage as
  // 'device_fingerprint' so it remains stable per device/session.
  async function sendSessionHeartbeat() {
    const token = getToken();

    // Get desktop device fingerprint (Device 1)
    const fingerprint = getDesktopDeviceFingerprint();

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

    // return parsed body if any
    const bodyText = await res.text().catch(() => "");
    try {
      return bodyText ? JSON.parse(bodyText) : null;
    } catch (e) {
      return null;
    }
  }

  // PHONE OTP API calls
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

  // versionId resolver
  const getActiveVersionId = () =>
    resolvedTemplateVersionId ?? templateVersion?.versionId ?? null;

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
        checks.push(!!formData.countryCode);
        checks.push(isValidPhoneForCountry(formData.countryCode, formData.phoneNumber));
        checks.push(BYPASS_OTP_FOR_DEVELOPMENT || isPhoneVerified);
      } else if (formData.phoneNumber) {
        checks.push(!!formData.countryCode);
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
        checks.push(!!formData.city && formData.city.trim().length >= 2);
      } else if (formData.city) {
        checks.push(formData.city.trim().length >= 2);
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
        checks.push(!!formData.permanentCity && formData.permanentCity.trim().length >= 2);
      } else if (formData.permanentCity) {
        checks.push(formData.permanentCity.trim().length >= 2);
      }

      if (requiredToggles.permanentPostal) {
        checks.push(isValidPostalCode(formData.permanentPostalCode));
      } else if (formData.permanentPostalCode) {
        checks.push(isValidPostalCode(formData.permanentPostalCode));
      }
    }

    return checks.length > 0 && checks.every(Boolean);
  };

  // Auto-mark step 1
  useEffect(() => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const ok = isStep1Complete();
    if (ok && !completedSections[1] && sections[0]) {
      setCompletedSections((prev) => ({ ...prev, 1: true }));
      postSectionData(sections[0]);

      if (currentStep === 1 && !hasShownStep1Toast) {
        const nextSection = sections[1];
        const isLastSection = sections.length === 1;

        if (isLastSection) {
          toast({
            title: "🎉 Verification Complete!",
            description: "All sections have been completed successfully.",
            duration: 5000,
          });
        } else {
          toast({
            title: `✅ ${sections[0]?.name || 'Personal Information'} Completed`,
            description: "Your personal information has been saved. Opening next section...",
            duration: 3000,
          });

          setHasShownStep1Toast(true);

          setTimeout(() => {
            setCurrentStep(2);
            setExpandedSections(prev => ({ ...prev, 2: true }));

            if (nextSection) {
              toast({
                title: `📋 ${nextSection.name}`,
                description: `Please complete the ${nextSection.name.toLowerCase()}.`,
                duration: 4000,
              });
            }
          }, 2000);
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

  // advance to step 3 when docs complete
  useEffect(() => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (currentStep === 2 && isIdentityDocumentCompleted && !hasShownStep2Toast) {
      if (!completedSections[2] && sections[1]) {
        setCompletedSections((prev) => ({ ...prev, 2: true }));
        postSectionData(sections[1]);
      }

      const nextSection = sections[2];
      const isLastSection = sections.length === 2;

      if (isLastSection) {
        toast({
          title: "🎉 Verification Complete!",
          description: "All sections have been completed successfully.",
          duration: 5000,
        });
      } else {
        toast({
          title: `✅ ${sections[1]?.name || 'Document Verification'} Completed`,
          description: "Your documents have been uploaded. Opening next section...",
          duration: 3000,
        });

        setHasShownStep2Toast(true);

        setTimeout(() => {
          setCurrentStep(3);
          setExpandedSections(prev => ({ ...prev, 3: true }));
          setShowMobileMenu(false);

          if (nextSection) {
            toast({
              title: `📋 ${nextSection.name}`,
              description: `Please complete the ${nextSection.name.toLowerCase()}.`,
              duration: 4000,
            });
          }
        }, 2000);
      }
    }
  }, [templateVersion, currentStep, isIdentityDocumentCompleted, hasShownStep2Toast, completedSections, toast]);

  // determine next step dynamically
  useEffect(() => {
    const sections = (templateVersion?.sections || [])
      .filter((s) => s.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    if (sections.length === 0) return;

    const isSectionComplete = (type: string) => {
      if (type === "personalInformation") return isStep1Complete();
      if (type === "documents") return isIdentityDocumentCompleted;
      if (type === "biometrics") return isSelfieCompleted;
      return true;
    };

    const firstIncompleteIdx = sections.findIndex(
      (s) => !isSectionComplete(s.sectionType as string),
    );
    const nextStep =
      firstIncompleteIdx === -1 ? sections.length : firstIncompleteIdx + 1;

    if (nextStep !== currentStep) {
      setCurrentStep(nextStep);
      setExpandedSections(prev => ({ ...prev, [nextStep]: true }));
      setShowMobileMenu(false);
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

  // ---- OTP handlers ----

  // Send Email OTP: always hit backend; on error show "<code> – Error from backend"
  const handleSendEmailOTP = async () => {
    const email = formData.email?.trim();
    const versionId = getActiveVersionId();

    if (emailLocked) {
      toast({ title: "Email verified", description: "This email is already verified." });
      return;
    }

    if (!email || !isValidEmail(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email first." });
      return;
    }
    if (versionId == null) {
      toast({ title: "Missing version", description: "No active template version found." });
      return;
    }

    try {
      setOtpSending(true);
      await generateEmailOtp(email, versionId);
      setPendingVerification({ type: "email", recipient: email });
      setOtpType("email");
      setShowOTPDialog(true);
      toast({ title: "OTP sent", description: `We've sent a verification code to ${email}.` });
    } catch (err: any) {
      toast({
        title: "Failed to send OTP",
        description: `${err?.status ?? "Unknown"} – Error from backend`,
        variant: "destructive",
      });
      // still open the dialog to allow entry in dev
      setPendingVerification({ type: "email", recipient: email ?? "" });
      setOtpType("email");
      setShowOTPDialog(true);
    } finally {
      setOtpSending(false);
    }
  };

  // Send Phone OTP similarly
  const handleSendPhoneOTP = async () => {
    const versionId = getActiveVersionId();
    if (versionId == null) {
      toast({ title: "Missing version", description: "No active template version found." });
      return;
    }

    const cc = (formData.countryCode || "").trim();
    const nn = (formData.phoneNumber || "").replace(/\D+/g, "");
    if (!cc || !nn || !isValidPhoneForCountry(formData.countryCode, formData.phoneNumber)) {
      toast({ title: "Invalid phone", description: "Please enter a valid phone number first." });
      return;
    }

    try {
      setOtpSending(true);
      const { success, otpId, expiresAt } = await startPhoneOtp(cc, nn, versionId, "whatsapp", "phoneVerification");
      if (!success) throw new Error("Failed to start phone OTP.");

      setPendingVerification({
        type: "phone",
        recipient: `${cc} ${formData.phoneNumber}`,
        otpId,
        expiresAt,
      });
      setOtpType("phone");
      setShowOTPDialog(true);
      toast({ title: "OTP sent", description: `We've sent a verification code to ${cc} ${formData.phoneNumber}.` });
    } catch (err: any) {
      toast({
        title: "Failed to send OTP",
        description: `${err?.status ?? "Unknown"} – Error from backend`,
        variant: "destructive",
      });
      // dev: still open dialog so user can try any code if needed
      setPendingVerification({
        type: "phone",
        recipient: `${cc} ${formData.phoneNumber}`,
      });
      setOtpType("phone");
      setShowOTPDialog(true);
    } finally {
      setOtpSending(false);
    }
  };

  // Verify (Email/Phone): always hit backend; on error show "<code> – Error from backend"
  // In dev, proceed anyway.
  const handleOTPVerify = async (otp: string) => {
    if (!pendingVerification) return;

    if (pendingVerification.type === "email") {
      const email = formData.email?.trim();
      const versionId = getActiveVersionId();
      if (!email || versionId == null) return;

      try {
        if (!submissionId) {
          toast({ title: "Missing submission", description: "Submission ID not found. Please try again.", variant: "destructive" });
          return;
        }

        setOtpValidating(true);
        const resp = await validateEmailOtp(email, versionId, otp, submissionId, "10:00:00");

        // If backend issued an access token, persist it so getToken() can use it later
        try {
          if (resp && typeof resp.accessToken === "string") {
            localStorage.setItem("access", resp.accessToken);
          }
        } catch (e) {
          // ignore storage errors
        }

        // attempt to start session heartbeat using the newly issued token
        try {
          await sendSessionHeartbeat();
          toast({ title: "Session started", description: "Session heartbeat sent." });
        } catch (hbErr: any) {
          toast({
            title: "Heartbeat Failed",
            description: `${hbErr?.status ?? "Unknown"} – Error from backend`,
            variant: "destructive",
          });
        }

        // success
        setIsEmailVerified(true);
        setEmailLocked(true);
        toast({ title: "Email verified", description: "Your email was successfully verified." });
        setShowOTPDialog(false);
        setPendingVerification(null);
      } catch (err: any) {
        // show backend error code
        toast({
          title: "OTP Validation Failed",
          description: `${err?.status ?? "Unknown"} – Error from backend`,
          variant: "destructive",
        });

        if (BYPASS_OTP_FOR_DEVELOPMENT) {
          // proceed anyway in dev
          setIsEmailVerified(true);
          setEmailLocked(true);
          toast({ title: "Email verified (dev bypass)", description: "Proceeding despite backend error." });
          setShowOTPDialog(false);
          setPendingVerification(null);
        }
      } finally {
        setOtpValidating(false);
      }
      return;
    }

    // PHONE verify
    const code = String(otp || "").trim();
    if (!pendingVerification.otpId) {
      toast({ title: "Missing OTP", description: "No OTP session found. Please resend the code.", variant: "destructive" });
      return;
    }

    try {
      setOtpValidating(true);
      const { success } = await verifyPhoneOtp(pendingVerification.otpId, code);
      if (!success) throw new Error("Invalid or expired code.");

      setIsPhoneVerified(true);
      toast({ title: "Phone verified", description: "Your phone number was successfully verified." });
      setShowOTPDialog(false);
      setPendingVerification(null);
    } catch (err: any) {
      toast({
        title: "OTP Validation Failed",
        description: `${err?.status ?? "Unknown"} – Error from backend`,
        variant: "destructive",
      });

      if (BYPASS_OTP_FOR_DEVELOPMENT) {
        setIsPhoneVerified(true);
        toast({ title: "Phone verified (dev bypass)", description: "Proceeding despite backend error." });
        setShowOTPDialog(false);
        setPendingVerification(null);
      }
    } finally {
      setOtpValidating(false);
    }
  };

  const handleOTPResend = async () => {
    const versionId = getActiveVersionId();

    if (pendingVerification?.type === "email") {
      const email = formData.email?.trim();
      if (!email || versionId == null) return;
      try {
        setOtpSending(true);
        await generateEmailOtp(email, versionId);
        toast({ title: "OTP resent", description: `A new OTP was sent to ${email}.` });
      } catch (err: any) {
        toast({
          title: "Failed to resend",
          description: `${err?.status ?? "Unknown"} – Error from backend`,
          variant: "destructive",
        });
      } finally {
        setOtpSending(false);
      }
    }

    if (pendingVerification?.type === "phone") {
      if (versionId == null) return;
      const cc = (formData.countryCode || "").trim();
      const nn = (formData.phoneNumber || "").replace(/\D+/g, "");
      if (!cc || !nn) return;

      try {
        setOtpSending(true);
        const { success, otpId, expiresAt } = await startPhoneOtp(cc, nn, versionId, "whatsapp", "phoneVerification");
        if (!success) throw new Error("Failed to start phone OTP.");
        setPendingVerification((pv) =>
          pv ? { ...pv, otpId, expiresAt } : { type: "phone", recipient: `${cc} ${formData.phoneNumber}`, otpId, expiresAt }
        );
        toast({ title: "OTP resent", description: `A new OTP was sent to ${cc} ${formData.phoneNumber}.` });
      } catch (err: any) {
        toast({
          title: "Failed to resend",
          description: `${err?.status ?? "Unknown"} – Error from backend`,
          variant: "destructive",
        });
      } finally {
        setOtpSending(false);
      }
    }
  };

  // Block closing the OTP dialog until verified (functional no-op)
  const handleOTPClose = () => {
    // For email OTPs: do not close until verified (non-dismissable email flows)
    if (otpType === "email" && !isEmailVerified) return;

    // For phone OTPs: allow closing immediately. Phone dialogs should be dismissable
    // (the UI already hides the X/backdrop when `nonDismissable` is true; callers
    // typically pass `nonDismissable={true}`, but phone is always considered closable
    // in the dialog component). Closing clears the pending verification state.
    setShowOTPDialog(false);
    setPendingVerification(null);
  };

  // Consent actions: after agree, immediately open OTP dialog and send OTP
  const handleConsentClose = () => setShowConsentDialog(false);
  const handleConsentAgree = async () => {
    setHasConsented(true);
    setShowConsentDialog(false);

    const email = (formData.email || "").trim();
    const versionId = getActiveVersionId();

    // If we have an email + version, open OTP and try to send
    if (email && versionId != null) {
      setPendingVerification({ type: "email", recipient: email });
      setOtpType("email");
      setShowOTPDialog(true);

      try {
        await generateEmailOtp(email, versionId);
      } catch (err: any) {
        toast({
          title: "Failed to send OTP",
          description: `${err?.status ?? "Unknown"} – Error from backend`,
          variant: "destructive",
        });
        // In dev we keep the dialog open; user can enter any code and we bypass on validate.
      }
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
        title: "🎉 Verification Complete!",
        description: "All sections have been completed successfully. Your identity verification is now complete.",
        duration: 5000,
      });
    } else {
      toast({
        title: `✅ ${biometricsSection?.name || 'Biometric Verification'} Completed`,
        description: "Biometric verification completed successfully. Please continue to the next section.",
        duration: 3000,
      });

      setTimeout(() => {
        const nextSectionIndex = biometricsSectionIndex + 1;
        if (nextSectionIndex <= activeSections.length) {
          setCurrentStep(nextSectionIndex);
          setExpandedSections(prev => ({ ...prev, [nextSectionIndex]: true }));
          const nextSection = activeSections[nextSectionIndex - 1];
          toast({
            title: `📋 ${nextSection?.name || 'Next Section'}`,
            description: `Please complete the ${nextSection?.name?.toLowerCase() || 'next section'}.`,
            duration: 4000,
          });
        }
      }, 2000);
    }
  };

  // Auto-save documents right after upload/add
  const handleDocumentUploaded = async () => {
    const documentsSection = activeSections.find(s => s.sectionType === "documents");
    if (documentsSection) {
      await postSectionData(documentsSection);
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
      if (isLastSection) {
        toast({
          title: "🎉 Verification Complete!",
          description: "All sections have been completed successfully. Your identity verification is now complete.",
          duration: 5000,
        });
      } else {
        toast({
          title: `✅ ${documentsSection?.name || 'Document Verification'} Completed`,
          description: "Your documents have been successfully uploaded and verified. Moving to the next section...",
          duration: 3000,
        });
      }
      setHasShownStep2Toast(true);
    }

    if (!isLastSection) {
      setTimeout(() => {
        const nextSectionIndex = documentsSectionIndex + 1;
        if (nextSectionIndex <= activeSections.length) {
          setCurrentStep(nextSectionIndex);
          setExpandedSections(prev => ({ ...prev, [nextSectionIndex]: true }));
          const nextSection = activeSections[nextSectionIndex - 1];
          toast({
            title: `📋 ${nextSection?.name || 'Next Section'}`,
            description: `Please complete the ${nextSection?.name?.toLowerCase() || 'next section'}.`,
            duration: 4000,
          });
        }
      }, 2000);
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      const missingFields = getMissingFields();
      if (missingFields.length > 0) {
        toast({
          title: "Form Incomplete",
          description: `Please complete the following: ${missingFields.join(", ")}`,
          variant: "destructive",
        });
      }
      return;
    }

    if (!userId || !templateVersion || !submissionId) {
      toast({
        title: "Missing Information",
        description:
          "User ID, template version, or submission ID not found. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Close SignalR connection before submitting
      shouldMaintainConnection.current = false;
      if (signalRConnectionRef.current) {
        console.log('🔌 Closing SignalR connection on form submission');
        try {
          await signalRConnectionRef.current.stop();
          console.log('✅ SignalR connection closed successfully');
        } catch (err) {
          console.error('❌ Error closing SignalR:', err);
        }
      }

      toast({
        title: "Submitting Form",
        description: "Please wait while we submit your information...",
      });

      const activeSections = templateVersion.sections.filter((s) => s.isActive);

      for (const section of activeSections) {
        let fieldValue = "";

        if (section.sectionType === "personalInformation") {
          const personalInfo = getPersonalInfoConfig();
          const mappedData: any = {};

          if (personalInfo.firstName) mappedData.firstName = formData.firstName;
          if (personalInfo.lastName) mappedData.lastName = formData.lastName;
          if (personalInfo.middleName)
            mappedData.middleName = formData.middleName;
          if (personalInfo.dateOfBirth)
            mappedData.dateOfBirth = formData.dateOfBirth;
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

          fieldValue = JSON.stringify(mappedData);
        } else if (section.sectionType === "documents") {
          fieldValue = JSON.stringify({
            country: documentFormState.country,
            documents: documentFormState.documentsDetails,
          });
        } else if (section.sectionType === "biometrics") {
          fieldValue = JSON.stringify({
            selfieUploaded: isSelfieCompleted,
            completedAt: new Date().toISOString(),
          });
        }

        const sectionResponse = await fetch(
          `${API_BASE}/api/UserTemplateSubmissionValues/${submissionId}/${section.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "*/*",
            },
            body: JSON.stringify({ fieldValue }),
          },
        );

        if (!sectionResponse.ok) {
          throw new Error(`Failed to submit ${section.sectionType} section`);
        }
      }

      toast({
        title: "Form Submitted Successfully!",
        description: "Your identity verification form has been submitted.",
      });

      navigate("/verification-progress");
    } catch (error) {
      console.error("Form submission error:", error);
      toast({
        title: "Submission Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to submit form. Please try again.",
        variant: "destructive",
      });
    }
  };

  // toggle section
  const toggleSection = async (idx: number) => {
    if (idx > currentStep) {
      toast({
        title: "Step locked",
        description:
          "You can only access unlocked steps. Complete the current step to continue.",
        variant: "destructive",
      });
      return;
    }

    setExpandedSections(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));

    if (expandedSections[idx] && completedSections[idx]) {
      const section = activeSections[idx - 1];
      if (section) await postSectionData(section);
    }
  };

  useEffect(() => {
    setExpandedSections(prev => ({ ...prev, [currentStep]: true }));
    if (currentStep >= 2) setShowMobileMenu(false);
  }, [currentStep]);

  // active sections by order
  const activeSections = (templateVersion?.sections || [])
    .filter((s) => s.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const isFormValid = () => {
    if (!templateVersion) return false;
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
      checks.push(!!formData.countryCode);
      checks.push(isValidPhoneForCountry(formData.countryCode, formData.phoneNumber));
      if (!BYPASS_OTP_FOR_DEVELOPMENT) {
        checks.push(isPhoneVerified);
      }
    }

    if (personalInfo.gender && requiredToggles.gender) {
      checks.push(!!formData.gender);
    }

    if (personalInfo.currentAddress) {
      if (requiredToggles.currentAddress) {
        checks.push(isValidAddress(formData.address));
      }
      if (requiredToggles.currentCity) {
        checks.push(!!formData.city && formData.city.trim().length >= 2);
      }
      if (requiredToggles.currentPostal) {
        checks.push(isValidPostalCode(formData.postalCode));
      }
    }

    if (personalInfo.permanentAddress) {
      if (requiredToggles.permanentAddress) {
        checks.push(isValidAddress(formData.permanentAddress));
      }
      if (requiredToggles.permanentCity) {
        checks.push(!!formData.permanentCity && formData.permanentCity.trim().length >= 2);
      }
      if (requiredToggles.permanentPostal) {
        checks.push(isValidPostalCode(formData.permanentPostalCode));
      }
    }

    const personalOk = checks.length > 0 && checks.every(Boolean);

    const docsSection = templateVersion.sections.find(
      (s) => s.sectionType === "documents",
    );
    const biometricsSection = templateVersion.sections.find(
      (s) => s.sectionType === "biometrics",
    );
    const docsRequired = !!docsSection?.isActive;
    const bioRequired = !!biometricsSection?.isActive;

    return (
      personalOk &&
      (!docsRequired || isIdentityDocumentCompleted) &&
      (!bioRequired || isSelfieCompleted)
    );
  };

  const getMissingFields = () => {
    if (!templateVersion) return ["Template data not loaded"];

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
      if (!isValidEmail(formData.email)) {
        missing.push("Valid Email");
      } else if (!isEmailVerified && !BYPASS_OTP_FOR_DEVELOPMENT) {
        missing.push("Email Verification (OTP)");
      }
    }

    if (personalInfo.phoneNumber && requiredToggles.phoneNumber) {
      if (!formData.countryCode) {
        missing.push("Country Code");
      } else if (!isValidPhoneForCountry(formData.countryCode, formData.phoneNumber)) {
        missing.push("Valid Phone Number");
      } else if (!isPhoneVerified && !BYPASS_OTP_FOR_DEVELOPMENT) {
        missing.push("Phone Verification (OTP)");
      }
    }

    if (personalInfo.gender && requiredToggles.gender && !formData.gender) {
      missing.push("Gender");
    }

    if (personalInfo.currentAddress) {
      if (requiredToggles.currentAddress && !isValidAddress(formData.address)) {
        missing.push("Current Address");
      }
      if (requiredToggles.currentCity && (!formData.city || formData.city.trim().length < 2)) {
        missing.push("Current City");
      }
      if (requiredToggles.currentPostal && !isValidPostalCode(formData.postalCode)) {
        missing.push("Current Postal Code");
      }
    }

    if (personalInfo.permanentAddress) {
      if (requiredToggles.permanentAddress && !isValidAddress(formData.permanentAddress)) {
        missing.push("Permanent Address");
      }
      if (requiredToggles.permanentCity && (!formData.permanentCity || formData.permanentCity.trim().length < 2)) {
        missing.push("Permanent City");
      }
      if (requiredToggles.permanentPostal && !isValidPostalCode(formData.permanentPostalCode)) {
        missing.push("Permanent Postal Code");
      }
    }

    const docsSection = templateVersion.sections.find(
      (s) => s.sectionType === "documents",
    );
    if (docsSection?.isActive && !isIdentityDocumentCompleted) {
      missing.push("Document Verification");
    }

    const biometricsSection = templateVersion.sections.find(
      (s) => s.sectionType === "biometrics",
    );
    if (biometricsSection?.isActive && !isSelfieCompleted) {
      missing.push("Selfie Verification");
    }

    return missing;
  };

  // Gating loaders
  if (linkResolveLoading) {
    return (
      <div className="w-full h-screen bg-page-background flex items-center justify-center">
        <div className="text-text-primary font-roboto text-lg">Preparing…</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-screen bg-page-background flex items-center justify-center">
        <div className="text-text-primary font-roboto text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen bg-page-background flex items-center justify-center">
        <div className="text-destructive font-roboto text-lg">
          Error: {error}
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
      {/* Consent Dialog */}
      <ConsentDialog
        isOpen={showConsentDialog && !hasConsented}
        onClose={handleConsentClose}
        onAgree={handleConsentAgree}
      />

      {/* How It Works Dialog */}
      <HowItWorksDialog
        isOpen={showHowItWorksDialog}
        onClose={() => setShowHowItWorksDialog(false)}
      />

      {/* OTP Verification Dialog */}
      <OTPVerificationDialog
        isOpen={showOTPDialog}
        onClose={handleOTPClose}         // no-op until verified
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

      <div
        className={`w-full min-h-screen bg-page-background flex flex-col ${
          (showConsentDialog && !hasConsented) || showOTPDialog
            ? "opacity-70 pointer-events-none"
            : ""
        }`}
      >
        {/* Header */}
        <Header
          onMobileMenuToggle={() => setShowMobileMenu((v) => !v)}
          isMobileMenuOpen={showMobileMenu}
        />

        {/* Title Bar - Mobile Layout */}
        <div className="flex w-full h-11 items-center flex-shrink-0 bg-background border-b border-border">
          <div className="flex flex-col items-start flex-1 px-3 sm:px-4">
            <div className="flex h-11 justify-between items-center self-stretch">
              <div className="flex items-center gap-1">
                <div className="text-text-primary font-roboto text-base font-bold leading-3">
                  Identity Verification Form
                </div>
                {/* More Button - Mobile */}
                <div className="sm:hidden flex w-8 h-8 justify-center items-center gap-2.5">
                  <svg
                    className="w-6 h-6 transform rotate-90"
                    viewBox="0 0 25 25"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M13.5 12.332C13.5 11.7797 13.0523 11.332 12.5 11.332C11.9477 11.332 11.5 11.7797 11.5 12.332C11.5 12.8843 11.9477 13.332 12.5 13.332C13.0523 13.332 13.5 12.8843 13.5 12.332Z"
                      stroke="#676879"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6.5 12.332C6.5 11.7797 6.05228 11.332 5.5 11.332C4.94772 11.332 4.5 11.7797 4.5 12.332C4.5 12.8843 4.94772 13.332 5.5 13.332C6.05228 13.332 6.5 12.8843 6.5 12.332Z"
                      stroke="#676879"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M20.5 12.332C20.5 11.7797 20.0523 11.332 19.5 11.332C18.9477 11.332 18.5 11.7797 18.5 12.332C18.5 12.8843 18.9477 13.332 19.5 13.332C20.0523 13.332 20.5 12.8843 20.5 12.332Z"
                      stroke="#676879"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSubmit}
                  className={`flex h-8 py-[9px] px-3 justify-center items-center gap-0.5 rounded ${
                    isFormValid() ? "bg-primary" : "bg-primary opacity-50"
                  }`}
                >
                  <span className="text-white font-roboto text-[13px] font-normal">
                    Submit
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex w-full flex-1 overflow-hidden">
          {/* Desktop Sidebar */}
          <div className="hidden lg:block border-r border-border">
            <StepSidebar sections={activeSections} currentStep={currentStep} />
          </div>

          {/* Mobile Sidebar Overlay */}
          {showMobileMenu && (
            <div className="lg:hidden fixed inset-0 z-50 flex">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowMobileMenu(false)}
                aria-hidden
              />

              {/* Panel */}
              <div
                id="mobile-step-sidebar"
                className="relative w-80 bg-white h-full border-r border-border shadow-lg overflow-auto"
              >
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

          {/* Content Area */}
          <div className="flex w-full flex-1 flex-col">
            {/* Mobile list of sections */}
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
                    shortCode={shortCode}
                    templateVersionId={templateVersion?.versionId}
                    userId={userId}
                    isFilled={!!completedSections[index + 1]}
                    documentFormState={documentFormState}
                    setDocumentFormState={setDocumentFormStateWithLogging}
                    onDocumentUploaded={handleDocumentUploaded}
                    biometricFormState={biometricFormState}
                    setBiometricFormState={setBiometricFormState}
                    emailLocked={emailLocked}
                  />
                ))}
              </div>
            </div>

            {/* Desktop */}
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
                      shortCode={shortCode}
                      templateVersionId={templateVersion?.versionId}
                      userId={userId}
                      isFilled={!!completedSections[index + 1]}
                      isExpanded={!!expandedSections[index + 1]}
                      onToggle={toggleSection}
                      documentFormState={documentFormState}
                      setDocumentFormState={setDocumentFormStateWithLogging}
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
