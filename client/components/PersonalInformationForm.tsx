import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import schema from "@/validations/personalInfoSchema";
import { FormData } from "@shared/templates";
import { COUNTRY_PHONE_RULES, digitsOnly } from "@/lib/validation";

type SchemaData = z.infer<typeof schema>;

interface PersonalInformationFormProps {
  formData: FormData;
  setFormData: (data: FormData) => void;
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
}

export function PersonalInformationForm({
  formData,
  setFormData,
  isEmailVerified,
  isPhoneVerified,
  onSendEmailOTP,
  onSendPhoneOTP,
  fieldConfig = {},
}: PersonalInformationFormProps) {
  // --- UI helpers you already had ---
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

  // --- RHF + Zod (no casts into ZodType<FormData>) ---
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<SchemaData>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    // Bridge your external FormData into what the schema expects:
    defaultValues: formData as unknown as SchemaData,
  });

  // Keep parent state in sync
  useEffect(() => {
    const sub = watch((values) => setFormData(values as unknown as FormData));
    return () => sub.unsubscribe();
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

  // Define onSubmit to satisfy TS and RHF
  const onSubmit = (_data: SchemaData) => {
    // Valid. Parent already synced via watch.
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col items-start self-stretch">
      {/* --- First/Last Name (unchanged layout) --- */}
      {/* First Name */}
      {shouldShowField("firstName") && (
        <div className="flex flex-col items-start flex-1 w-full">
          <div className="flex pb-2 items-start gap-2 self-stretch">
            <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary text-[13px]">
              <span className="text-text-primary">
                First Name <span className="text-destructive"> *</span>
              </span>
            </div>
          </div>
          <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.firstName ? "border-destructive" : "border-input-border"} bg-background`}>
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
              className="w-full bg-transparent outline-none"
            />
          </div>
          {errors.firstName && (
            <div id="err-firstName" role="alert" className="text-destructive text-[12px] mt-1">
              {errors.firstName.message as string}
            </div>
          )}
        </div>
      )}

      {/* Last Name */}
      {shouldShowField("lastName") && (
        <div className="flex flex-col items-start flex-1 w-full mt-4">
          <div className="flex pb-2 items-start gap-2 self-stretch">
            <div className="flex h-2.5 flex-col justify-center flex-1 text-text-primary text-[13px]">
              <span className="text-text-primary">
                Last Name <span className="text-destructive"> *</span>
              </span>
            </div>
          </div>
          <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.lastName ? "border-destructive" : "border-input-border"} bg-background`}>
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
              className="w-full bg-transparent outline-none"
            />
          </div>
          {errors.lastName && (
            <div id="err-lastName" role="alert" className="text-destructive text-[12px] mt-1">
              {errors.lastName.message as string}
            </div>
          )}
        </div>
      )}

      {/* Middle Name + DOB */}
      <div className="flex flex-col sm:flex-row gap-4 self-stretch mt-6 w-full">
        {shouldShowField("middleName") && (
          <div className="flex flex-col flex-1">
            <div className="pb-2">
              <span className="text-text-primary text-[13px]">
                Middle Name <RequiredMark show={isRequired("middleName")} />
              </span>
            </div>
            <div className="flex h-[38px] py-[15px] px-3 items-center rounded border border-input-border bg-background">
              <input
                type="text"
                placeholder="Enter Name"
                {...register("middleName")}
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>
        )}

        {shouldShowField("dateOfBirth") && (
          <div className="flex flex-col flex-1">
            <div className="pb-2">
              <span className="text-text-primary text-[13px]">
                Date Of Birth <RequiredMark show={isRequired("dateOfBirth")} />
              </span>
            </div>
            <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.dateOfBirth ? "border-destructive" : "border-input-border"} bg-background`}>
              <input
                type="date"
                placeholder="DD/MM/YYYY"
                value={formatDOBToInput(watch("dateOfBirth"))}
                onChange={(e) =>
                  setValue("dateOfBirth", parseInputDateToDOB(e.target.value), {
                    shouldValidate: true,
                    shouldTouch: true,
                  })
                }
                aria-invalid={!!errors.dateOfBirth}
                aria-describedby={errors.dateOfBirth ? "err-dateOfBirth" : undefined}
                className="w-full bg-transparent outline-none"
              />
            </div>
            {errors.dateOfBirth && (
              <div id="err-dateOfBirth" role="alert" className="text-destructive text-[12px] mt-1">
                {errors.dateOfBirth.message as string}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Email */}
      {shouldShowField("email") && (
        <div className="flex flex-col mt-6 w-full">
          <div className="pb-2">
            <span className="text-text-primary text-[13px]">
              Email <span className="text-destructive">*</span>
            </span>
          </div>
          <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.email ? "border-destructive" : "border-input-border"} bg-background`}>
            <input
              type="email"
              placeholder="Enter Your Email Address"
              {...register("email", {
                onChange: (e) =>
                  setValue("email", e.target.value.trim(), { shouldValidate: true }),
              })}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "err-email" : undefined}
              className="w-full bg-transparent outline-none"
            />
            <button
              type="button"
              onClick={onSendEmailOTP}
              disabled={!!errors.email || !getValues("email") || isEmailVerified}
              className={`ml-2 h-7 px-3 rounded ${!!errors.email || !getValues("email") || isEmailVerified ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="text-primary text-[12px]">{isEmailVerified ? "Verified" : "Send OTP"}</span>
            </button>
          </div>
          {errors.email ? (
            <div id="err-email" role="alert" className="text-destructive text-[12px] mt-1">
              {errors.email.message as string}
            </div>
          ) : !isEmailVerified ? (
            <div className="text-text-muted text-[12px] mt-1">Email verification is required to continue.</div>
          ) : null}
        </div>
      )}

      {/* Phone */}
      {shouldShowField("phoneNumber") && (
        <div className="flex flex-col mt-6 w-full">
          <div className="pb-2">
            <span className="text-text-primary text-[13px]">
              Phone Number <RequiredMark show={isRequired("phoneNumber")} />
            </span>
          </div>
          <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.phoneNumber || errors.countryCode ? "border-destructive" : "border-input-border"} bg-background`}>
            <select
              {...register("countryCode")}
              aria-invalid={!!errors.countryCode}
              aria-describedby={errors.countryCode ? "err-countryCode" : undefined}
              className="bg-transparent outline-none border-r pr-2 mr-2 min-w-[70px] max-w-[120px]"
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
                onChange: (e) => setValue("phoneNumber", digitsOnly(e.target.value), { shouldValidate: true }),
              })}
              aria-invalid={!!errors.phoneNumber}
              aria-describedby={errors.phoneNumber ? "err-phoneNumber" : undefined}
              className="w-full bg-transparent outline-none"
            />
            <button
              type="button"
              onClick={onSendPhoneOTP}
              disabled={
                !!errors.countryCode ||
                !!errors.phoneNumber ||
                !getValues("phoneNumber") ||
                !getValues("countryCode") ||
                isPhoneVerified
              }
              className={`ml-2 h-7 px-3 rounded ${
                !!errors.countryCode ||
                !!errors.phoneNumber ||
                !getValues("phoneNumber") ||
                !getValues("countryCode") ||
                isPhoneVerified
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
            >
              <span className="text-primary text-[12px]">
                {isPhoneVerified ? "Verified" : "Send OTP"}
              </span>
            </button>
          </div>
          {errors.countryCode ? (
            <div id="err-countryCode" role="alert" className="text-destructive text-[12px] mt-1">
              {errors.countryCode.message as string}
            </div>
          ) : errors.phoneNumber ? (
            <div id="err-phoneNumber" role="alert" className="text-destructive text-[12px] mt-1">
              {errors.phoneNumber.message as string}
            </div>
          ) : !isPhoneVerified ? (
            <div className="text-text-muted text-[12px] mt-1">Phone number verification is required to continue.</div>
          ) : null}
        </div>
      )}

      {/* Current Address */}
      {shouldShowField("currentAddress") && (
        <div className="mt-6 w-full">
          <div className="pb-1">
            <div className="text-text-primary text-[16px] font-bold">Current Address <span className="text-text-muted text-[13px] font-normal">(as per ID)</span></div>
            <div className="text-text-muted text-[13px]">Enter your current residential address exactly as shown on your government-issued ID.</div>
          </div>

          <div className="mt-3">
            <div className="pb-2">
              <span className="text-text-primary text-[13px]">
                Current Address <RequiredMark show={isRequired("address")} />
              </span>
            </div>
            <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.address ? "border-destructive" : "border-input-border"} bg-background`}>
              <input
                type="text"
                placeholder="e.g 123 MG Road, Shastri Nagar, Near City Park"
                {...register("address")}
                aria-invalid={!!errors.address}
                aria-describedby={errors.address ? "err-address" : undefined}
                className="w-full bg-transparent outline-none"
              />
            </div>
            {errors.address && (
              <div id="err-address" role="alert" className="text-destructive text-[12px] mt-1">
                {errors.address.message as string}
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="pb-2">
                <span className="text-text-primary text-[13px]">
                  City <RequiredMark show={isRequired("city")} />
                </span>
              </div>
              <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.city ? "border-destructive" : "border-input-border"} bg-background`}>
                <input
                  type="text"
                  placeholder="e.g Mumbai"
                  {...register("city")}
                  aria-invalid={!!errors.city}
                  aria-describedby={errors.city ? "err-city" : undefined}
                  className="w-full bg-transparent outline-none"
                />
              </div>
              {errors.city && (
                <div id="err-city" role="alert" className="text-destructive text-[12px] mt-1">
                  {errors.city.message as string}
                </div>
              )}
            </div>

            <div>
              <div className="pb-2">
                <span className="text-text-primary text-[13px]">
                  Postal Code <RequiredMark show={isRequired("postalCode")} />
                </span>
              </div>
              <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.postalCode ? "border-destructive" : "border-input-border"} bg-background`}>
                <input
                  type="text"
                  placeholder="e.g 432001"
                  {...register("postalCode")}
                  aria-invalid={!!errors.postalCode}
                  aria-describedby={errors.postalCode ? "err-postalCode" : undefined}
                  className="w-full bg-transparent outline-none"
                />
              </div>
              {errors.postalCode && (
                <div id="err-postalCode" role="alert" className="text-destructive text-[12px] mt-1">
                  {errors.postalCode.message as string}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Permanent Address */}
      {shouldShowField("permanentAddress") && (
        <div className="mt-6 w-full">
          <div className="pb-1">
            <div className="text-text-primary text-[16px] font-bold">Permanent Address <span className="text-text-muted text-[13px] font-normal">(as per ID)</span></div>
            <div className="text-text-muted text-[13px]">Enter your permanent address exactly as shown on your government-issued ID.</div>
          </div>

          <div className="mt-3">
            <div className="pb-2">
              <span className="text-text-primary text-[13px]">
                Permanent Address <RequiredMark show={isRequired("permanentAddress")} />
              </span>
            </div>
            <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.permanentAddress ? "border-destructive" : "border-input-border"} bg-background`}>
              <input
                type="text"
                placeholder="e.g 456 Park Street, Gandhi Nagar, Near Mall"
                {...register("permanentAddress")}
                aria-invalid={!!errors.permanentAddress}
                aria-describedby={errors.permanentAddress ? "err-permanentAddress" : undefined}
                className="w-full bg-transparent outline-none"
              />
            </div>
            {errors.permanentAddress && (
              <div id="err-permanentAddress" role="alert" className="text-destructive text-[12px] mt-1">
                {errors.permanentAddress.message as string}
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="pb-2">
                <span className="text-text-primary text-[13px]">
                  Permanent City <RequiredMark show={isRequired("permanentCity")} />
                </span>
              </div>
              <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.permanentCity ? "border-destructive" : "border-input-border"} bg-background`}>
                <input
                  type="text"
                  placeholder="e.g Delhi"
                  {...register("permanentCity")}
                  aria-invalid={!!errors.permanentCity}
                  aria-describedby={errors.permanentCity ? "err-permanentCity" : undefined}
                  className="w-full bg-transparent outline-none"
                />
              </div>
              {errors.permanentCity && (
                <div id="err-permanentCity" role="alert" className="text-destructive text-[12px] mt-1">
                  {errors.permanentCity.message as string}
                </div>
              )}
            </div>

            <div>
              <div className="pb-2">
                <span className="text-text-primary text-[13px]">
                  Permanent Postal Code <RequiredMark show={isRequired("permanentPostalCode")} />
                </span>
              </div>
              <div className={`flex h-[38px] py-[15px] px-3 items-center rounded border ${errors.permanentPostalCode ? "border-destructive" : "border-input-border"} bg-background`}>
                <input
                  type="text"
                  placeholder="e.g 110001"
                  {...register("permanentPostalCode")}
                  aria-invalid={!!errors.permanentPostalCode}
                  aria-describedby={errors.permanentPostalCode ? "err-permanentPostalCode" : undefined}
                  className="w-full bg-transparent outline-none"
                />
              </div>
              {errors.permanentPostalCode && (
                <div id="err-permanentPostalCode" role="alert" className="text-destructive text-[12px] mt-1">
                  {errors.permanentPostalCode.message as string}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden submit (optional) */}
      {/* <button type="submit" className="hidden" /> */}
    </form>
  );
}
