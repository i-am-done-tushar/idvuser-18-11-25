/**
 * ============================================================================
 * PERSONAL INFORMATION VALIDATION SCHEMA
 * ============================================================================
 * Zod schema for validating personal information form fields in the identity
 * verification flow. Supports dynamic field requirements based on API configuration.
 * 
 * Features:
 * - Dynamic validation based on requiredToggles from backend
 * - Country-specific phone number validation
 * - DOB validation with 18+ age requirement (DD/MM/YYYY format)
 * - Optional vs required field handling
 * 
 * Usage:
 *   const schema = makePersonalInfoSchema(requiredToggles);
 *   schema.parse(formData); // Throws ZodError if invalid
 */
import { z } from "zod";

/**
 * Phone number length rules by country dial code
 * Maps country codes to expected phone number lengths (min/max digits)
 */
export const PHONE_LENGTH_BY_DIAL: Record<string, { min: number; max: number }> = {
  "+91":  { min: 10, max: 10 }, // India
  "+1":   { min: 10, max: 10 }, // USA/Canada
  "+44":  { min: 10, max: 10 }, // UK
  "+61":  { min:  9, max:  9 }, // Australia
  "+49":  { min: 10, max: 11 }, // Germany
  "+33":  { min:  9, max:  9 }, // France
  "+65":  { min:  8, max:  8 }, // Singapore
  "+971": { min:  9, max:  9 }, // UAE
  "+55":  { min: 10, max: 11 }, // Brazil
  "+81":  { min:  9, max: 10 }, // Japan
};

/**
 * Configuration object defining which fields are required
 * Received from backend API based on template configuration
 */
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

/**
 * Base validation rule for name fields (firstName, lastName, middleName)
 * Requires: 2+ characters, letters and spaces only, supports Unicode letters
 */
const nameRule = z
  .string()
  .min(2, "Must be at least 2 characters")
  .regex(/^[A-Za-z\s]+$/, "Only letters and spaces are allowed");

/**
 * Helper function to make a field conditionally required
 * @param enabled - Whether the field is required
 * @param base - The base Zod type for the field
 * @param emptyOk - Whether empty string is acceptable when not required
 */
const req = (enabled: boolean, base: z.ZodTypeAny, emptyOk = true) =>
  enabled ? base : (emptyOk ? z.union([z.literal(""), base.optional()]) : base.optional());

/**
 * Zod validator for phone numbers - ensures only digits are present
 */
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
  return threshold <= todayUtc;
}

/**
 * ============================================================================
 * DYNAMIC SCHEMA FACTORY
 * ============================================================================
 * Creates a Zod validation schema based on dynamic field requirements from the backend.
 * Handles conditional validation for optional vs required fields.
 * 
 * @param rt - RequiredToggles object defining which fields are mandatory
 * @returns Zod schema for PersonalInfoSchema validation with custom phone number validation
 */
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
    /**
     * Custom validation: Phone number length must match country-specific rules
     * Uses superRefine to validate phoneNumber length based on selected countryCode
     * Skips validation if phone is optional and empty
     */
    .superRefine(({ countryCode, phoneNumber }, ctx) => {
      const phoneIsEmpty = !phoneNumber || phoneNumber === "";
      if (!rt.phoneNumber && phoneIsEmpty) return; // Skip if optional and empty
      if (!countryCode || !phoneNumber) return; // Skip if incomplete

      const rule = PHONE_LENGTH_BY_DIAL[countryCode as keyof typeof PHONE_LENGTH_BY_DIAL];
      if (!rule) return; // No rule for this country code

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

// ============================================================================
// TYPE EXPORTS & DEFAULT SCHEMA
// ============================================================================

/**
 * TypeScript type inferred from the dynamic schema
 * Represents the shape of validated personal information data
 */
export type PersonalInfoSchema = z.infer<ReturnType<typeof makePersonalInfoSchema>>;

/**
 * Default schema instance with typical required fields
 * Used as a fallback or for testing purposes
 * In production, schema is dynamically generated from backend RequiredToggles
 */
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
