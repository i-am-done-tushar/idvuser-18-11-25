// personalInfoSchema.ts
import { z } from "zod";

export const PHONE_LENGTH_BY_DIAL: Record<string, { min: number; max: number }> = {
  "+91":  { min: 10, max: 10 },
  "+1":   { min: 10, max: 10 },
  "+44":  { min: 10, max: 10 },
  "+61":  { min:  9, max:  9 },
  "+49":  { min: 10, max: 11 },
  "+33":  { min:  9, max:  9 },
  "+65":  { min:  8, max:  8 },
  "+971": { min:  9, max:  9 },
  "+55":  { min: 10, max: 11 },
  "+81":  { min:  9, max: 10 },
};

export type RequiredToggles = {
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

const nameRule = z
  .string()
  .min(2, "Must be at least 2 characters")
  .regex(/^[A-Za-z\s]+$/, "Only letters and spaces are allowed");

// --- Helpers ---
const req = (enabled: boolean, base: z.ZodTypeAny, emptyOk = true) =>
  enabled ? base : (emptyOk ? z.union([z.literal(""), base.optional()]) : base.optional());

const digitsOnly = z.string().regex(/^\d+$/, "Phone number must only contain digits");

// --- DOB helpers (DD/MM/YYYY) ---
const DOB_RE = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d\d$/;

function parseDDMMYYYY(s: string): Date | null {
  const m = DOB_RE.exec(s);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]) - 1; // 0–11
  const yyyy = Number(s.slice(-4));
  // Use UTC so timezones don’t shift the date
  const d = new Date(Date.UTC(yyyy, mm, dd));
  // Validate calendar correctness (e.g., 31/04 invalid)
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== mm ||
    d.getUTCDate() !== dd
  ) return null;
  return d;
}

function isAtLeastYearsUTC(dobUtc: Date, years: number): boolean {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(
    today.getFullYear(), today.getMonth(), today.getDate()
  ));
  const threshold = new Date(Date.UTC(
    dobUtc.getUTCFullYear() + years,
    dobUtc.getUTCMonth(),
    dobUtc.getUTCDate()
  ));
  return threshold <= todayUtc; // true if already had the birthday
}


export const makePersonalInfoSchema = (rt: RequiredToggles) => {
  const emailRequired = z
    .string()
    .email("Please enter a valid email address")
    .min(1, "Please enter a valid email address");

  // ✅ Required DOB: format + real date + 18+
  const dobRequired = z
    .string()
    .refine((v) => DOB_RE.test(v), { message: "Enter a valid DOB (DD/MM/YYYY)." })
    .refine((v) => parseDDMMYYYY(v) !== null, { message: "Enter a valid DOB (DD/MM/YYYY)." })
    .refine((v) => {
      const d = parseDDMMYYYY(v);
      return d ? isAtLeastYearsUTC(d, 18) : true; // previous refine handles null
    }, { message: "You must be at least 18 years old." });

  // ✅ Optional DOB: allow "" OR (format + real date + 18+)
  const dobOptional = z
    .string()
    .refine((v) => v === "" || DOB_RE.test(v), { message: "Enter a valid DOB (DD/MM/YYYY)." })
    .refine((v) => v === "" || parseDDMMYYYY(v) !== null, { message: "Enter a valid DOB (DD/MM/YYYY)." })
    .refine((v) => {
      if (v === "") return true;
      const d = parseDDMMYYYY(v);
      return d ? isAtLeastYearsUTC(d, 18) : true;
    }, { message: "You must be at least 18 years old." });

  const dateOfBirth = rt.dob ? dobRequired : dobOptional;

  const minLen = (n: number, msg: string) =>
    z.string().refine((v) => v === "" || v.trim().length >= n, { message: msg });

  const schema = z
    .object({
      firstName: nameRule,
      lastName: nameRule,
      email: emailRequired,

      middleName: req(!!rt.middleName, z.string().trim().min(1, "Middle name is required")),
      gender: req(!!rt.gender, z.string().min(1, "Gender is required")),
      dateOfBirth,

      address: req(!!rt.currentAddress, minLen(5, "Address must be at least 5 characters long")),
      city: req(!!rt.currentCity, minLen(2, "City must be at least 2 characters long")),
      postalCode: req(!!rt.currentPostal, z.string().regex(/^\d{5,6}$/, "Enter a valid postal code")),

      permanentAddress: req(
        !!rt.permanentAddress,
        minLen(5, "Permanent address must be at least 5 characters long")
      ),
      permanentCity: req(
        !!rt.permanentCity,
        minLen(2, "Permanent city must be at least 2 characters long")
      ),
      permanentPostalCode: req(
        !!rt.permanentPostal,
        z.string().regex(/^\d{5,6}$/, "Enter a valid permanent postal code")
      ),

      countryCode: req(!!rt.phoneNumber, z.string().min(1, "Please select a country code.")),
      phoneNumber: req(!!rt.phoneNumber, digitsOnly.min(1, "Please enter a valid phone number")),
    })
    .superRefine(({ countryCode, phoneNumber }, ctx) => {
      const phoneIsEmpty = !phoneNumber || phoneNumber === "";
      if (!rt.phoneNumber && phoneIsEmpty) return;
      if (!countryCode || !phoneNumber) return;

      const rule = PHONE_LENGTH_BY_DIAL[countryCode as keyof typeof PHONE_LENGTH_BY_DIAL];
      if (!rule) return;

      const len = phoneNumber.length;
      if (len < rule.min || len > rule.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phoneNumber"],
          message:
            rule.min === rule.max
              ? `Phone number must be exactly ${rule.min} digits for ${countryCode}.`
              : `Phone number must be ${rule.min}–${rule.max} digits for ${countryCode}.`,
        });
      }
    });

  return schema;
};

// types/default
export type PersonalInfoSchema = z.infer<ReturnType<typeof makePersonalInfoSchema>>;
const personalInfoSchema = makePersonalInfoSchema({
  phoneNumber: true,
  gender: false,
  currentAddress: true,
  currentCity: true,
  currentPostal: true,
  permanentAddress: true,
  permanentCity: true,
  permanentPostal: true,
  dob: true,
  middleName: false,
});
export default personalInfoSchema;
