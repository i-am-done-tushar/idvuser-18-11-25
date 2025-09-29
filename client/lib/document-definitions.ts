/**
 * Dynamic Document Definition ID mapping based on country and document type
 */

// Document Definition ID mapping based on country and document type
export const getDocumentDefinitionId = (country: string, documentName: string): string => {
  // Normalize document name to match database codes
  const normalizedDoc = documentName.toLowerCase().replace(/\s+/g, "_");
  
  // Country to ISO2 mapping
  const countryToISO2: Record<string, string> = {
    "India": "IN",
    "United States": "US",
    "United Kingdom": "GB",
    // Add more countries as needed
  };
  
  const countryCode = countryToISO2[country];
  if (!countryCode) {
    console.warn(`Country "${country}" not found in mapping, using fallback ID`);
    return "543d16b7-78fd-48d5-9ae0-60481f2952a6"; // fallback to Aadhaar
  }
  
  // Document mapping for India (IN)
  if (countryCode === "IN") {
    const documentMapping: Record<string, string> = {
      "aadhaar_card": "543d16b7-78fd-48d5-9ae0-60481f2952a6", // AADHAAR_IND
      "voter_id": "820fe16b-1e77-45e3-a379-cc65a8b80282", // VOTERID_IND
      "passport": "92af84b9-196a-4278-b7a3-009b858a468a", // PASSPORT_IND
      "indian_passport": "92af84b9-196a-4278-b7a3-009b858a468a", // PASSPORT_IND
      "pan_card": "9b04f4a9-8bf1-4fa3-a215-da3d2797dffa", // PAN_IND
      "driving_license": "f4c1d677-cc9c-47a0-a2d5-16da984b2343", // DL_IND
      "driver_license": "f4c1d677-cc9c-47a0-a2d5-16da984b2343", // DL_IND
    };
    
    const documentId = documentMapping[normalizedDoc];
    if (documentId) {
      console.log(`Selected document: ${documentName} (${normalizedDoc}) -> ID: ${documentId}`);
      return documentId;
    }
  }
  
  // Add mappings for other countries here
  // Example for US:
  // if (countryCode === "US") {
  //   const documentMapping: Record<string, string> = {
  //     "passport": "us-passport-id",
  //     "driver_license": "us-dl-id",
  //     "state_id": "us-state-id-id",
  //   };
  //   
  //   const documentId = documentMapping[normalizedDoc];
  //   if (documentId) return documentId;
  // }
  
  console.warn(`Document "${documentName}" not found for country "${country}", using fallback ID`);
  return "543d16b7-78fd-48d5-9ae0-60481f2952a6"; // fallback to Aadhaar
};

/**
 * Get all supported documents for a country
 */
export const getSupportedDocumentsForCountry = (country: string): string[] => {
  const countryToISO2: Record<string, string> = {
    "India": "IN",
    "United States": "US",
    "United Kingdom": "GB",
  };
  
  const countryCode = countryToISO2[country];
  
  if (countryCode === "IN") {
    return [
      "Aadhaar Card",
      "Voter ID", 
      "Passport",
      "Indian Passport",
      "PAN Card",
      "Driving License",
      "Driver License"
    ];
  }
  
  // Add other countries here
  
  return [];
};

/**
 * Validate if a document is supported for a country
 */
export const isDocumentSupportedForCountry = (country: string, documentName: string): boolean => {
  const supportedDocs = getSupportedDocumentsForCountry(country);
  return supportedDocs.some(doc => 
    doc.toLowerCase().replace(/\s+/g, "_") === documentName.toLowerCase().replace(/\s+/g, "_")
  );
};