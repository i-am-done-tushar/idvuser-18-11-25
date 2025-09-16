import { RequestHandler } from "express";
import { TemplateResponse } from "@shared/templates";

// Mock template data based on the API response example
const mockTemplate: TemplateResponse = {
  id: 1,
  name: "Identity Verification Template",
  description: "Standard identity verification process",
  createdBy: 1,
  createdByName: "System Admin",
  createdByEmail: "admin@idv.local",
  updatedBy: null,
  updatedByName: "",
  updatedByEmail: "",
  createdAt: "2025-01-14T11:28:19.173459+00:00",
  updatedAt: null,
  versions: [
    {
      versionId: 2,
      templateId: 1,
      versionNumber: 2,
      isActive: true,
      enforceRekyc: true,
      rekycDeadline: "2025-12-31",
      changeSummary: "Updated personal information fields",
      isDeleted: false,
      createdBy: 1,
      createdByName: "System Admin",
      createdByEmail: "admin@idv.local",
      updatedBy: null,
      updatedByName: "",
      updatedByEmail: "",
      createdAt: "2025-01-14T12:11:23.594132",
      updatedAt: "2025-01-14T12:11:23.594132",
      rowVersionBase64: "CN3ztexinqA=",
      sections: [
        {
          id: 5,
          templateVersionId: 2,
          name: "Personal Information",
          description: "Basic personal information for identity verification",
          orderIndex: 1,
          sectionType: "personalInformation",
          isActive: true,
          createdBy: 1,
          createdByName: "System Admin",
          createdByEmail: "admin@idv.local",
          updatedBy: null,
          updatedByName: null,
          updatedByEmail: null,
          createdAt: "2025-01-14T12:11:23.778971+00:00",
          updatedAt: null,
          fieldMappings: [
            {
              id: 5,
              templateSectionId: 5,
              structure: {
                fields: [
                  { name: "firstName", type: "string", required: true },
                  { name: "lastName", type: "string", required: true },
                  { name: "middleName", type: "string", required: false },
                  { name: "dateOfBirth", type: "date", required: true },
                  { name: "email", type: "email", required: true },
                  { name: "phoneNumber", type: "string", required: true },
                  { name: "gender", type: "enum", required: false, options: ["Male", "Female", "Non-Binary", "Prefer Not To Say"] },
                  { name: "address", type: "string", required: true },
                  { name: "city", type: "string", required: true },
                  { name: "postalCode", type: "string", required: true }
                ]
              },
              captureAllowed: false,
              uploadAllowed: false
            }
          ]
        },
        {
          id: 4,
          templateVersionId: 2,
          name: "Identity Document",
          description: "Government-issued identification document verification",
          orderIndex: 2,
          sectionType: "documents",
          isActive: true,
          createdBy: 1,
          createdByName: "System Admin",
          createdByEmail: "admin@idv.local",
          updatedBy: null,
          updatedByName: null,
          updatedByEmail: null,
          createdAt: "2025-01-14T12:11:23.718873+00:00",
          updatedAt: null,
          fieldMappings: [
            {
              id: 4,
              templateSectionId: 4,
              structure: {
                fields: [
                  { name: "documentType", type: "enum", required: true, options: ["passport", "driversLicense", "nationalId"] },
                  { name: "documentNumber", type: "string", required: true },
                  { name: "expiryDate", type: "date", required: false }
                ]
              },
              captureAllowed: true,
              uploadAllowed: true
            }
          ]
        },
        {
          id: 6,
          templateVersionId: 2,
          name: "Biometric Verification",
          description: "Live selfie capture for biometric verification",
          orderIndex: 3,
          sectionType: "biometrics",
          isActive: true,
          createdBy: 1,
          createdByName: "System Admin",
          createdByEmail: "admin@idv.local",
          updatedBy: null,
          updatedByName: null,
          updatedByEmail: null,
          createdAt: "2025-01-14T12:11:23.784691+00:00",
          updatedAt: null,
          fieldMappings: [
            {
              id: 6,
              templateSectionId: 6,
              structure: {},
              captureAllowed: true,
              uploadAllowed: false
            }
          ]
        }
      ]
    }
  ]
};

export const handleGetTemplate: RequestHandler = (req, res) => {
  const { id } = req.params;
  
  // In a real app, you would fetch from database using the id
  // For now, return the mock template for any ID
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: "Invalid template ID" });
  }

  // Simulate template with the requested ID
  const template = { ...mockTemplate, id: Number(id) };
  
  res.json(template);
};
