import { useState, useEffect } from 'react';
import { ErrorOutline, Spinner } from './SVG_Files';
import { generateQRCodeDataURL, QRCodeOptions } from '@/lib/qr-utils';

interface QRCodeDisplayProps {
  shortCode: string;
  templateVersionId?: number;
  userId?: number;
  sessionId?: string;
  currentStep?: string;
  size?: 'small' | 'medium' | 'large';
  showUrl?: boolean;
  className?: string;
}

export function QRCodeDisplay({
  shortCode,
  templateVersionId,
  userId,
  sessionId,
  currentStep = 'document-upload',
  size = 'medium',
  showUrl = true,
  className = '',
}: QRCodeDisplayProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [verificationUrl, setVerificationUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const sizeClasses = {
    small: 'w-16 h-16 sm:w-20 sm:h-20',
    medium: 'w-20 h-20 sm:w-24 sm:h-24',
    large: 'w-24 h-24 sm:w-32 sm:h-32',
  };

  useEffect(() => {
    const generateQRCode = async () => {
      if (!shortCode) {
        setError('No shortcode provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const options: QRCodeOptions = {
          shortCode,
          templateVersionId,
          userId,
          sessionId,
          currentStep,
        };

        const dataUrl = await generateQRCodeDataURL(options);
        setQrCodeDataUrl(dataUrl);

  // Generate display URL for user reference (use query param to avoid long path segments)
  const envBaseUrl = import.meta.env.VITE_QR_BASE_URL || import.meta.env.VITE_FRONTEND_URL;
  const displayBaseUrl = envBaseUrl || window.location.origin;
  const url = `${displayBaseUrl}/form?code=${encodeURIComponent(shortCode)}`;
  setVerificationUrl(url);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
        setError('Failed to generate QR code');
      } finally {
        setLoading(false);
      }
    };

    generateQRCode();
  }, [shortCode, templateVersionId, userId, sessionId, currentStep]);

  if (loading) {
    return (
      <div className={`flex justify-center items-center ${sizeClasses[size]} ${className}`}>
        <Spinner className="rounded-full h-8 w-8 text-[#0073EA]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col justify-center items-center ${sizeClasses[size]} ${className} bg-gray-100 rounded-lg`}>
        <ErrorOutline className="w-6 h-6 text-gray-400 mb-1" />
        <span className="text-xs text-gray-500 text-center">QR Error</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {qrCodeDataUrl ? (
        <img
          src={qrCodeDataUrl}
          alt="QR Code for verification"
          className={`${sizeClasses[size]} object-contain rounded-lg border-2 border-white shadow-lg bg-white p-2`}
          onError={(e) => {
            console.error('QR Code image failed to load:', e);
            setError('Failed to display QR code');
          }}
        />
      ) : (
        <div className={`${sizeClasses[size]} bg-gray-100 rounded-lg flex items-center justify-center`}>
          <span className="text-gray-500 text-xs">No QR Code</span>
        </div>
      )}
      {showUrl && verificationUrl && (
        <div className="text-xs text-[#0073EA] text-center break-all max-w-[200px]">
          {verificationUrl.length > 40 
            ? `${verificationUrl.substring(0, 40)}...` 
            : verificationUrl
          }
        </div>
      )}
    </div>
  );
}