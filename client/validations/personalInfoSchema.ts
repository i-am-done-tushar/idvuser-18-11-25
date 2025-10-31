import { z } from "zod";

const schema = z.object({
  firstName: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .regex(/^[A-Za-z\s]+$/, "First name can only contain letters and spaces"),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .regex(/^[A-Za-z\s]+$/, "Last name can only contain letters and spaces"),
  dateOfBirth: z
    .string()
    .regex(/^(0[1-9]|1[0-9]|2[0-9]|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d\d$/, "Enter a valid DOB (DD/MM/YYYY). You must be at least 18."),
  email: z
    .string()
    .email("Please enter a valid email address"),
  countryCode: z.string().nonempty("Please select a country code."),
  phoneNumber: z
    .string()
    .nonempty("Please enter a valid phone number")
    .regex(/^\d+$/, "Phone number must only contain digits"),
  address: z
    .string()
    .min(5, "Address must be at least 5 characters long"),
  city: z
    .string()
    .min(2, "City must be at least 2 characters long"),
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
  gender: z
    .string()
    .optional(),
  middleName: z
    .string()
    .optional(),
});

export default schema;
