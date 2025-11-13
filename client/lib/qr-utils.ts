import QRCode from 'qrcode';

export interface QRCodeOptions {
  shortCode: string;
  templateVersionId?: number;
  userId?: number;
  sessionId?: string;
  currentStep?: string;
}

/**
 * Generate a QR code data URL for continuing verification on another device
 */
export async function generateQRCodeDataURL(options: QRCodeOptions): Promise<string> {
  try {
    // For join codes, use the baseUrl from the options or fallback
    const baseUrl = 'http://10.10.5.231:4200';
    
    // If shortCode looks like a join code (contains underscores or special chars), 
    // use the joincode route directly
    const finalUrl = `${baseUrl}/HandoffPage/${options.shortCode}`;

    // Generate QR code with options for better mobile scanning
    const qrCodeDataUrl = await QRCode.toDataURL(finalUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256,
    });

    return qrCodeDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Extract session information from URL parameters
 */
export function extractSessionFromURL(): Partial<QRCodeOptions> {
  const urlParams = new URLSearchParams(window.location.search);
  
  return {
    templateVersionId: urlParams.get('templateVersionId') ? 
      parseInt(urlParams.get('templateVersionId')!) : undefined,
    userId: urlParams.get('userId') ? 
      parseInt(urlParams.get('userId')!) : undefined,
    sessionId: urlParams.get('sessionId') || undefined,
    currentStep: urlParams.get('step') || undefined,
  };
}