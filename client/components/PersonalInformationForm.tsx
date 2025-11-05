import { useEffect, useMemo, useRef } from "react";
import { useForm, useController } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { makePersonalInfoSchema, PersonalInfoSchema } from "@/validations/personalInfoSchema";
import { FormData } from "@shared/templates";
import { COUNTRY_PHONE_RULES, digitsOnly } from "@/lib/validation";

interface PersonalInformationFormProps {
  formData: FormData;
  // setFormData: (data: FormData) => void;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  onSendEmailOTP: () => void;
  onSendPhoneOTP: () => void;
  fieldConfig?: {
    email?: boolean;
    gender?: boolean;
    lastName?: boolean;
    firstName?: boolean;
    dateOfBirth?: boolean;
    currentAddress?: boolean;
    permanentAddress?: boolean;
    phoneNumber?: boolean;
    middleName?: boolean;
    city?: boolean;
    postalCode?: boolean;
    requiredToggles?: {
      phoneNumber?: boolean;
      gender?: boolean;
      currentAddress?: boolean;
      currentCity?: boolean;
      currentPostal?: boolean;
      permanentAddress?: boolean;
      permanentCity?: boolean;
      permanentPostal?: boolean;
      dob?: boolean;
      middleName?: boolean;
    };
  };
  /** ✅ NEW: when true, email field is locked and shown as verified */
  emailLocked?: boolean; // ✅
}

export function PersonalInformationForm(props: PersonalInformationFormProps) {
  const {
    formData,
    setFormData,
    isEmailVerified,
    isPhoneVerified,
    onSendEmailOTP,
    onSendPhoneOTP,
    fieldConfig = {},
    emailLocked, // ✅ NEW
  } = props;

  const rt = fieldConfig?.requiredToggles ?? {};

  const isRequired = (field: string) => {
    const map: Record<string, boolean> = {
      dateOfBirth: !!rt.dob,
      middleName: !!rt.middleName,
      gender: !!rt.gender,
      phoneNumber: !!rt.phoneNumber,
      address: !!rt.currentAddress,
      city: !!rt.currentCity,
      postalCode: !!rt.currentPostal,
      permanentAddress: !!rt.permanentAddress,
      permanentCity: !!rt.permanentCity,
      permanentPostalCode: !!rt.permanentPostal,
    };
    return !!map[field];
  };
  const RequiredMark = ({ show }: { show: boolean }) =>
    show ? <span className="text-destructive">*</span> : null;

  const shouldShowField = (fieldName: string): boolean => {
    if (!fieldConfig || Object.keys(fieldConfig).length === 0) {
      return ["firstName", "lastName", "email"].includes(fieldName);
    }
    if (fieldName === "currentAddress") return fieldConfig.currentAddress === true;
    if (fieldName === "permanentAddress") return fieldConfig.permanentAddress === true;

    const fieldMapping: Record<string, string> = {
      firstName: "firstName",
      lastName: "lastName",
      email: "email",
      gender: "gender",
      dateOfBirth: "dateOfBirth",
      address: "currentAddress",
      city: "currentAddress",
      postalCode: "currentAddress",
      permanentCity: "permanentAddress",
      permanentPostalCode: "permanentAddress",
      phoneNumber: "phoneNumber",
      countryCode: "phoneNumber",
      middleName: "middleName",
    };
    const key = fieldMapping[fieldName];
    if (!key) return false;
    return fieldConfig[key as keyof typeof fieldConfig] === true;
  };

  // Stable defaults on mount
  const initialDefaults = useMemo(() => formData as PersonalInfoSchema, []); // mount-only
  // ⬇️ Build schema from toggles
  const schema = useMemo(() => makePersonalInfoSchema(rt), [rt]);

  const REQUIRED_KEYS = useMemo(() => {
    const keys: (keyof PersonalInfoSchema)[] = ["firstName", "lastName", "email"];
    if (rt.dob) keys.push("dateOfBirth");
    if (rt.middleName) keys.push("middleName");
    if (rt.gender) keys.push("gender");
    if (rt.currentAddress) keys.push("address");
    if (rt.currentCity) keys.push("city");
    if (rt.currentPostal) keys.push("postalCode");
    if (rt.permanentAddress) keys.push("permanentAddress");
    if (rt.permanentCity) keys.push("permanentCity");
    if (rt.permanentPostal) keys.push("permanentPostalCode");
    if (rt.phoneNumber) keys.push("countryCode", "phoneNumber");
    return keys;
  }, [rt]);

  // ---- RHF + Zod ----
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors, touchedFields, dirtyFields },
    reset,
    clearErrors,
    trigger,
    control,
  } = useForm<PersonalInfoSchema>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldUnregister: false,
    defaultValues: initialDefaults,
  });

  const { field: dob } = useController({
    name: "dateOfBirth",
    control,
  });

  // ----- Guard to avoid feedback loop -----
  const hydratingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  // Hydrate form and validate only required fields
  useEffect(() => {
    hydratingRef.current = true;
    reset(formData as PersonalInfoSchema, { keepDefaultValues: false });
    clearErrors();

    // Only trigger validation on mount for required keys that already have a value.
    // This prevents showing "Must be at least 2 characters" (or other) errors
    // for empty fields immediately when the form is mounted.
    try {
      const keysToTrigger = REQUIRED_KEYS.filter((k) => {
        const v = (formData as any)[k];
        return v !== undefined && v !== null && String(v).trim() !== "";
      });
      if (keysToTrigger.length > 0) void trigger(keysToTrigger as any);
    } catch (err) {
      // ignore
    }

    const t = window.setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [formData, reset, clearErrors, trigger, REQUIRED_KEYS]);

  // Child → parent with debounce
  useEffect(() => {
    const sub = watch((values: Partial<PersonalInfoSchema>) => {
      if (hydratingRef.current) return;
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        setFormData((prev) => ({ ...prev, ...(values as Partial<FormData>) }));
      }, 200) as unknown as number;
    });
    return () => {
      sub.unsubscribe();
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [watch, setFormData]);

  // DOB adapters
  const formatDOBToInput = (dob: string | undefined) => {
    if (!dob) return "";
    const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const [, day, month, year] = m;
    return `${year}-${month}-${day}`;
  };
  const parseInputDateToDOB = (value: string) => {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) return "";
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  };

  const onSubmit = (_data: PersonalInfoSchema) => {
    // Valid; parent already updated via watch.
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col items-start self-stretch">
      <div className="flex flex-col items-start gap-6 self-stretch">
        {/* ===== Name row ===== */}
        <div className="flex flex-col items-start self-stretch">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 self-stretch">
            {/* First Name */}
            {shouldShowField("firstName") && (
              <div className="flex flex-col items-start flex-1 w-full">
                <div className="flex pb-2 items-start gap-2 self-stretch">
                  <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                    <span className="text-text-primary">
                      First Name <span className="text-destructive"> *</span>
                    </span>
                  </div>
                </div>
                <div
                  className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                    errors.firstName ? "border-destructive" : "border-input-border"
                  } bg-background`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      placeholder="Enter Name"
                      {...register("firstName", {
                        onChange: (e) =>
                          setValue("firstName", e.target.value.replace(/[^\p{L}\s]/gu, ""), {
                            shouldValidate: true,
                          }),
                      })}
                      aria-invalid={!!errors.firstName}
                      aria-describedby={errors.firstName ? "err-firstName" : undefined}
                      className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                    />
                  </div>
                </div>
                {(() => {
                  const hasValue = !!getValues("firstName");
                  const wasTouched = !!(dirtyFields.firstName || touchedFields.firstName);
                  const show = !!errors.firstName && (wasTouched || hasValue);
                  return show ? (
                    <div id="err-firstName" role="alert" className="text-destructive text-[12px] mt-1">
                      {errors.firstName.message as string}
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {/* Last Name */}
            {shouldShowField("lastName") && (
              <div className="flex flex-col items-start flex-1 w-full">
                <div className="flex pb-2 items-start gap-2 self-stretch">
                  <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                    <span className="text-text-primary">
                      Last Name <span className="text-destructive"> *</span>
                    </span>
                  </div>
                </div>
                <div
                  className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                    errors.lastName ? "border-destructive" : "border-input-border"
                  } bg-background`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      placeholder="Enter Your Full Name"
                      {...register("lastName", {
                        onChange: (e) =>
                          setValue("lastName", e.target.value.replace(/[^\p{L}\s]/gu, ""), {
                            shouldValidate: true,
                          }),
                      })}
                      aria-invalid={!!errors.lastName}
                      aria-describedby={errors.lastName ? "err-lastName" : undefined}
                      className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                    />
                  </div>
                </div>
                {(() => {
                  const hasValue = !!getValues("lastName");
                  const wasTouched = !!(dirtyFields.lastName || touchedFields.lastName);
                  const show = !!errors.lastName && (wasTouched || hasValue);
                  return show ? (
                    <div id="err-lastName" role="alert" className="text-destructive text-[12px] mt-1">
                      {errors.lastName.message as string}
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* ===== Middle Name & DOB ===== */}
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 self-stretch mt-6">
            {shouldShowField("middleName") && (
              <div className="flex flex-col items-start flex-1 w-full">
                <div className="flex pb-2 items-start gap-2 self-stretch">
                  <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                    <span className="text-text-primary">
                      Middle Name <RequiredMark show={isRequired("middleName")} />
                    </span>
                  </div>
                </div>
                <div className="flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border border-input-border bg-background">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      placeholder="Enter Name"
                      {...register("middleName")}
                      className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                    />
                  </div>
                </div>
              </div>
            )}

            {shouldShowField("dateOfBirth") && (
              <div className="flex w-full sm:flex-1 flex-col items-start">
                <div className="flex pb-2 items-start gap-2 self-stretch">
                  <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                    <span className="text-text-primary">
                      Date Of Birth <RequiredMark show={isRequired("dateOfBirth")} />
                    </span>
                  </div>
                </div>

                <div
                  className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                    errors.dateOfBirth ? "border-destructive" : "border-input-border"
                  } bg-background`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="date"
                      placeholder="DD/MM/YYYY"
                      value={formatDOBToInput(dob.value)}
                      onChange={(e) => dob.onChange(parseInputDateToDOB(e.target.value))}
                      onBlur={dob.onBlur}
                      name={dob.name}
                      ref={dob.ref}
                      aria-invalid={!!errors.dateOfBirth}
                      aria-describedby={errors.dateOfBirth ? "err-dateOfBirth" : undefined}
                      className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                    />
                  </div>
                </div>
                {errors.dateOfBirth && (
                  <div id="err-dateOfBirth" role="alert" className="text-destructive text-[12px] mt-1">
                    {errors.dateOfBirth.message as string}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===== Email & Phone ===== */}
          <div className="flex flex-col items-start gap-6 self-stretch mt-6">
            <div className="flex flex-col lg:flex-row items-start gap-4 lg:gap-6 self-stretch">
              {/* Email */}
              {shouldShowField("email") && (
                <div className="flex flex-col items-start flex-1 w-full">
                  <div className="flex pb-2 items-start gap-2 self-stretch">
                    <div className="flex h-2.5 flex-col justify-center flex-1 font-roboto text-[13px] font-normal leading-[18px]">
                      <span className="text-text-primary">
                        Email <span className="text-destructive"> *</span>
                      </span>
                      {/* removed green verified badge per UX request */}
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-1 self-stretch">
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.email ? "border-destructive" : "border-input-border"
                      } bg-background`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="email"
                          placeholder="Enter Your Email Address"
                          {...register("email", {
                            onChange: (e) => setValue("email", e.target.value.trim(), { shouldValidate: true }),
                          })}
                          disabled={!!emailLocked || isEmailVerified} // ✅ NEW: lock input
                          aria-invalid={!!errors.email}
                          aria-describedby={errors.email ? "err-email" : undefined}
                          className={`text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted ${
                            emailLocked || isEmailVerified ? "opacity-75 cursor-not-allowed" : ""
                          }`}
                        />
                      </div>
                      <button
                        onClick={onSendEmailOTP}
                        type="button"
                        disabled={!!errors.email || !getValues("email") || isEmailVerified || !!emailLocked} // ✅ NEW: respect emailLocked
                        aria-disabled={!!errors.email || !getValues("email") || isEmailVerified || !!emailLocked}
                        className={`flex h-7 py-[9px] px-3 justify-center items-center gap-2 rounded bg-background ${
                          !!errors.email || !getValues("email") || isEmailVerified || !!emailLocked
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        title={
                          emailLocked
                            ? "Email is locked/verified"
                            : isEmailVerified
                            ? "Email already verified"
                            : !getValues("email")
                            ? "Enter a valid email first"
                            : "Send verification OTP"
                        }
                      >
                        <span className="text-primary font-figtree text-[12px] font-normal">
                          {emailLocked || isEmailVerified ? "Verified" : "Send OTP"}
                        </span>
                      </button>
                    </div>
                    {errors.email ? (
                      <div id="err-email" role="alert" className="text-destructive text-[12px] mt-1">
                        {errors.email.message as string}
                      </div>
                    ) : !isEmailVerified && !emailLocked ? (
                      <div className="text-text-muted text-[12px] mt-1">
                        Email verification is required to continue.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Phone */}
              {shouldShowField("phoneNumber") && (
                <div className="flex flex-col items-start flex-1 w-full">
                  <div className="flex pb-2 items-start gap-2 self-stretch">
                    <div className="flex h-2.5 flex-col justify-center flex-1 font-roboto text-[13px] font-normal leading-[18px]">
                      <span className="text-text-primary">
                        Phone Number <RequiredMark show={isRequired("phoneNumber")} />
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-1 self-stretch">
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.phoneNumber || errors.countryCode ? "border-destructive" : "border-input-border"
                      } bg-background`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <select
                          {...register("countryCode", {
                            onChange: (e) => setValue("countryCode", e.target.value, { shouldValidate: false }),
                            onBlur: () => {
                              // validate on blur only
                              void trigger("countryCode");
                            },
                          })}
                          aria-invalid={!!errors.countryCode}
                          aria-describedby={errors.countryCode ? "err-countryCode" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 bg-transparent outline-none border-r border-input-border pr-2 mr-2 min-w-[70px] max-w-[100px] flex-shrink-0"
                        >
                          <option value="">Select</option>
                          {COUNTRY_PHONE_RULES.map((c) => (
                            <option key={c.dial} value={c.dial}>{`${c.dial} ${c.name}`}</option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          placeholder="Enter Your Mobile Number"
                          {...register("phoneNumber", {
                            onChange: (e) => setValue("phoneNumber", digitsOnly(e.target.value), { shouldValidate: false, shouldTouch: true }),
                            onBlur: (e) => {
                              // validate on blur only
                              void trigger("phoneNumber");
                            },
                          })}
                          aria-invalid={!!errors.phoneNumber}
                          aria-describedby={errors.phoneNumber ? "err-phoneNumber" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                        />
                      </div>
                      <button
                        onClick={onSendPhoneOTP}
                        type="button"
                        disabled={
                          !!errors.countryCode ||
                          !!errors.phoneNumber ||
                          !getValues("phoneNumber") ||
                          !getValues("countryCode") ||
                          isPhoneVerified
                        }
                        aria-disabled={
                          !!errors.countryCode ||
                          !!errors.phoneNumber ||
                          !getValues("phoneNumber") ||
                          !getValues("countryCode") ||
                          isPhoneVerified
                        }
                        className={`flex h-7 py-[9px] px-3 justify-center items-center gap-2 rounded bg-background ${
                          !!errors.countryCode ||
                          !!errors.phoneNumber ||
                          !getValues("phoneNumber") ||
                          !getValues("countryCode") ||
                          isPhoneVerified
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        <span className="text-primary font-figtree text-[12px] font-normal">
                          {isPhoneVerified ? "Verified" : "Send OTP"}
                        </span>
                      </button>
                    </div>
                    {(() => {
                      const countryTouched = !!touchedFields.countryCode;
                      const phoneTouched = !!touchedFields.phoneNumber;
                      const showCountryErr = !!errors.countryCode && countryTouched;
                      const showPhoneErr = !!errors.phoneNumber && phoneTouched;

                      if (showCountryErr) {
                        return (
                          <div id="err-countryCode" role="alert" className="text-destructive text-[12px] mt-1">
                            {errors.countryCode!.message as string}
                          </div>
                        );
                      }

                      if (showPhoneErr) {
                        return (
                          <div id="err-phoneNumber" role="alert" className="text-destructive text-[12px] mt-1">
                            {errors.phoneNumber!.message as string}
                          </div>
                        );
                      }

                      return !isPhoneVerified ? (
                        <div className="text-text-muted text-[12px] mt-1"></div>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===== Gender ===== */}
          {shouldShowField("gender") && (
            <div className="flex w-full items-start gap-4 lg:gap-6 mt-6">
              <div className="flex w-full lg:w-[458px] h-auto lg:h-14 items-start gap-4 lg:gap-6 flex-shrink-0">
                <div className="flex w-full h-auto lg:h-14 flex-col items-start flex-1">
                  <div className="flex pb-2 items-start gap-2 self-stretch">
                    <span className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                      Gender <RequiredMark show={isRequired("gender")} />
                    </span>
                  </div>

                  <div className="flex flex-wrap items-start gap-2 sm:gap-3">
                    {["Male", "Female", "Non-Binary", "Prefer Not To Say"].map((option) => (
                      <label key={option} className="flex h-[38px] py-2 pr-2 items-center gap-2 rounded-full cursor-pointer">
                        <span className="w-4 h-4 rounded-full border-[0.667px] border-step-inactive-border bg-background relative inline-flex items-center justify-center">
                          <input
                            type="radio"
                            value={option}
                            {...register("gender")}
                            checked={watch("gender") === option}
                            onChange={() => setValue("gender", option, { shouldValidate: true, shouldTouch: true })}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            aria-label={option}
                          />
                          {watch("gender") === option && <span className="absolute inset-1 rounded-full bg-primary" />}
                        </span>
                        <span className="text-text-muted font-roboto text-[13px] font-normal leading-[22px]">
                          {option}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== Current Address ===== */}
          {shouldShowField("currentAddress") && (
            <div className="flex flex-col items-start gap-4 self-stretch w-full mt-6">
              <div className="flex pb-1 flex-col items-start gap-1 self-stretch">
                <div className="text-text-primary font-roboto text-[16px] font-bold leading-[26px]">
                  Current Address <span className="font-normal text-[13px] text-text-muted">(as per ID)</span>
                </div>
                <div className="self-stretch text-text-muted font-roboto text-[13px] font-normal leading-5">
                  Enter your current residential address exactly as shown on your government-issued ID.
                </div>
              </div>

              <div className="flex flex-col items-start self-stretch w-full">
                <div className="flex h-auto items-start gap-4 self-stretch w-full">
                  <div className="flex flex-col items-start flex-1 w-full">
                    <div className="flex pb-2 items-start gap-2 self-stretch">
                      <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                        <span className="text-text-primary">
                          Current Address <RequiredMark show={isRequired("address")} />
                        </span>
                      </div>
                    </div>
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.address ? "border-destructive" : "border-input-border"
                      } bg-background w-full`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          placeholder="e.g 123 MG Road, Shastri Nagar, Near City Park"
                          {...register("address")}
                          aria-invalid={!!errors.address}
                          aria-describedby={errors.address ? "err-address" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                        />
                      </div>
                    </div>
                    {errors.address && (
                      <div id="err-address" role="alert" className="text-destructive text-[12px] mt-1">
                        {errors.address.message as string}
                      </div>
                    )}
                  </div>
                </div>

                {/* City / Postal Code */}
                <div className="inline-flex flex-col sm:flex-row items-start gap-4 sm:gap-6 w-full mt-6">
                  <div className="flex flex-col items-start w-full sm:flex-1">
                    <div className="flex pb-2 items-start gap-2 self-stretch">
                      <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                        <span className="text-text-primary">
                          City <RequiredMark show={isRequired("city")} />
                        </span>
                      </div>
                    </div>
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.city ? "border-destructive" : "border-input-border"
                      } bg-background w-full`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          placeholder="e.g Mumbai"
                          {...register("city")}
                          aria-invalid={!!errors.city}
                          aria-describedby={errors.city ? "err-city" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                        />
                      </div>
                    </div>
                    {errors.city && (
                      <div id="err-city" role="alert" className="text-destructive text-[12px] mt-1">
                        {errors.city.message as string}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-start w-full sm:flex-1">
                    <div className="flex pb-2 items-start gap-2 self-stretch">
                      <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                        <span className="text-text-primary">
                          Postal Code <RequiredMark show={isRequired("postalCode")} />
                        </span>
                      </div>
                    </div>
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.postalCode ? "border-destructive" : "border-input-border"
                      } bg-background w-full`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          placeholder="e.g 432001"
                          {...register("postalCode")}
                          aria-invalid={!!errors.postalCode}
                          aria-describedby={errors.postalCode ? "err-postalCode" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                        />
                      </div>
                    </div>
                    {errors.postalCode && (
                      <div id="err-postalCode" role="alert" className="text-destructive text-[12px] mt-1">
                        {errors.postalCode.message as string}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== Permanent Address ===== */}
          {shouldShowField("permanentAddress") && (
            <div className="flex flex-col items-start gap-4 self-stretch w-full mt-6">
              <div className="flex pb-1 flex-col items-start gap-1 self-stretch">
                <div className="text-text-primary font-roboto text-[16px] font-bold leading-[26px]">
                  Permanent Address <span className="font-normal text-[13px] text-text-muted">(as per ID)</span>
                </div>
                <div className="self-stretch text-text-muted font-roboto text-[13px] font-normal leading-5">
                  Enter your permanent address exactly as shown on your government-issued ID.
                </div>
              </div>

              <div className="flex flex-col items-start self-stretch w-full">
                <div className="flex h-auto items-start gap-4 self-stretch w-full">
                  <div className="flex flex-col items-start flex-1 w-full">
                    <div className="flex pb-2 items-start gap-2 self-stretch">
                      <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                        <span className="text-text-primary">
                          Permanent Address <RequiredMark show={isRequired("permanentAddress")} />
                        </span>
                      </div>
                    </div>
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.permanentAddress ? "border-destructive" : "border-input-border"
                      } bg-background w-full`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          placeholder="e.g 456 Park Street, Gandhi Nagar, Near Mall"
                          {...register("permanentAddress")}
                          aria-invalid={!!errors.permanentAddress}
                          aria-describedby={errors.permanentAddress ? "err-permanentAddress" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                        />
                      </div>
                    </div>
                    {errors.permanentAddress && (
                      <div id="err-permanentAddress" role="alert" className="text-destructive text-[12px] mt-1">
                        {errors.permanentAddress.message as string}
                      </div>
                    )}
                  </div>
                </div>

                <div className="inline-flex flex-col sm:flex-row items-start gap-4 sm:gap-6 w-full mt-6">
                  <div className="flex flex-col items-start w-full sm:flex-1">
                    <div className="flex pb-2 items-start gap-2 self-stretch">
                      <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                        <span className="text-text-primary">
                          Permanent City <RequiredMark show={isRequired("permanentCity")} />
                        </span>
                      </div>
                    </div>
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.permanentCity ? "border-destructive" : "border-input-border"
                      } bg-background w-full`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          placeholder="e.g Delhi"
                          {...register("permanentCity")}
                          aria-invalid={!!errors.permanentCity}
                          aria-describedby={errors.permanentCity ? "err-permanentCity" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                        />
                      </div>
                    </div>
                    {errors.permanentCity && (
                      <div id="err-permanentCity" role="alert" className="text-destructive text-[12px] mt-1">
                        {errors.permanentCity.message as string}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-start w-full sm:flex-1">
                    <div className="flex pb-2 items-start gap-2 self-stretch">
                      <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary font-roboto text-[13px] font-normal leading-[18px]">
                        <span className="text-text-primary">
                          Permanent Postal Code <RequiredMark show={isRequired("permanentPostalCode")} />
                        </span>
                      </div>
                    </div>
                    <div
                      className={`flex h-[38px] py-[15px] px-3 justify-between items-center self-stretch rounded border ${
                        errors.permanentPostalCode ? "border-destructive" : "border-input-border"
                      } bg-background w-full`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          placeholder="e.g 110001"
                          {...register("permanentPostalCode")}
                          aria-invalid={!!errors.permanentPostalCode}
                          aria-describedby={errors.permanentPostalCode ? "err-permanentPostalCode" : undefined}
                          className="text-text-muted font-roboto text-[13px] font-normal leading-5 w-full bg-transparent border-none outline-none placeholder:text-text-muted"
                        />
                      </div>
                    </div>
                    {errors.permanentPostalCode && (
                      <div id="err-permanentPostalCode" role="alert" className="text-destructive text-[12px] mt-1">
                        {errors.permanentPostalCode.message as string}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
