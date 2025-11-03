import { z } from "zod";

// National significant number (digits after country code)
export const PHONE_LENGTH_BY_DIAL: Record<string, { min: number; max: number }> = {
  "+91":  { min: 10, max: 10 }, // India
  "+1":   { min: 10, max: 10 }, // United States (NANP)
  "+44":  { min: 10, max: 10 }, // United Kingdom (typical)
  "+61":  { min:  9, max:  9 }, // Australia
  "+49":  { min: 10, max: 11 }, // Germany
  "+33":  { min:  9, max:  9 }, // France
  "+65":  { min:  8, max:  8 }, // Singapore
  "+971": { min:  9, max:  9 }, // UAE
  "+55":  { min: 10, max: 11 }, // Brazil
  "+81":  { min:  9, max: 10 }, // Japan
};

const nameRule = z
  .string()
  .min(2, "Must be at least 2 characters")
  .regex(/^[A-Za-z\s]+$/, "Only letters and spaces are allowed");

const dobRule = z.string().regex(
  /^(0[1-9]|1[0-9]|2[0-9]|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d\d$/,
  "Enter a valid DOB (DD/MM/YYYY). You must be at least 18."
);

export const personalInfoSchema = z
  .object({
    firstName: nameRule,
    lastName: nameRule,
    dateOfBirth: dobRule,
    email: z.string().email("Please enter a valid email address"),

    countryCode: z.string().nonempty("Please select a country code."),
    phoneNumber: z
      .string()
      .nonempty("Please enter a valid phone number")
      .regex(/^\d+$/, "Phone number must only contain digits"),

    address: z.string().min(5, "Address must be at least 5 characters long"),
    city: z.string().min(2, "City must be at least 2 characters long"),
    postalCode: z
      .string()
      .regex(/^\d{5,6}$/, "Enter a valid postal code"),

    permanentAddress: z
      .string()
      .min(5, "Permanent address must be at least 5 characters long"),
    permanentCity: z
      .string()
      .min(2, "Permanent city must be at least 2 characters long"),
    permanentPostalCode: z
      .string()
      .regex(/^\d{5,6}$/, "Enter a valid permanent postal code"),

    gender: z.string().optional(),
    middleName: z.string().optional(),
  })
  .superRefine(({ countryCode, phoneNumber }, ctx) => {
    const rule = PHONE_LENGTH_BY_DIAL[countryCode];
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

export type PersonalInfoSchema = z.infer<typeof personalInfoSchema>;
export default personalInfoSchema;
