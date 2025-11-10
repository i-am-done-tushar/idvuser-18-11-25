// authLoginSchema.ts
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

// Email validation schema
export const emailLoginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
});

// Phone validation schema
export const phoneLoginSchema = z
  .object({
    countryCode: z.string().min(1, "Please select a country code"),
    phoneNumber: z
      .string()
      .min(1, "Please enter a phone number")
      .regex(/^\d+$/, "Phone number must only contain digits"),
  })
  .superRefine(({ countryCode, phoneNumber }, ctx) => {
    const rule = PHONE_LENGTH_BY_DIAL[countryCode];
    if (!rule) {
      // Unknown country code - use generic validation
      const len = phoneNumber.length;
      if (len < 7 || len > 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phoneNumber"],
          message: "Please enter a valid phone number (7-15 digits)",
        });
      }
      return;
    }

    const len = phoneNumber.length;
    if (len < rule.min || len > rule.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phoneNumber"],
        message:
          rule.min === rule.max
            ? `Phone number must be exactly ${rule.min} digits for ${countryCode}`
            : `Phone number must be ${rule.min}-${rule.max} digits for ${countryCode}`,
      });
    }
  });

// Type exports
export type EmailLoginSchema = z.infer<typeof emailLoginSchema>;
export type PhoneLoginSchema = z.infer<typeof phoneLoginSchema>;
