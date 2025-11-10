import { useState, useEffect, useRef } from 'react';
import { ErrorOutline, Spinner, CloseIcon } from './SVG_Files';
import { generateQRCodeDataURL, QRCodeOptions } from '@/lib/qr-utils';
import { useToast } from '@/hooks/use-toast';
import * as signalR from '@microsoft/signalr';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';

// API base & IDV_VERIFICATION base

interface QRCodeDisplayProps {
  shortCode: string;
  templateVersionId?: number;
  userId?: number;
  sessionId?: string;
  currentStep?: string;
  submissionId?: number | null;
  size?: 'small' | 'medium' | 'large';
  showUrl?: boolean;
  className?: string;
  // Props for controlling SignalR connection lifecycle from parent
  connectionRef?: React.MutableRefObject<any>;
  shouldMaintainConnection?: React.MutableRefObject<boolean>;
}

export function QRCodeDisplay(props: QRCodeDisplayProps) {
  const {
    shortCode,
    templateVersionId,
    userId,
    sessionId,
    currentStep = 'document-upload',
    submissionId,
    size = 'medium',
    showUrl = true,
    className = '',
    connectionRef: externalConnectionRef,
    shouldMaintainConnection,
  } = props;

  const { toast } = useToast();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [verificationUrl, setVerificationUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const internalConnectionRef = useRef<signalR.HubConnection | null>(null);
  
  // Use external ref if provided, otherwise use internal ref
  const connectionRef = externalConnectionRef || internalConnectionRef;

  // Steps:
  // 0: blurred placeholder → click generates QR
  // 1: QR visible (normal size) → click enlarges to modal
  // 2: enlarged modal → backdrop / X / Escape closes back to 1
  const [clickStep, setClickStep] = useState<number>(0);

  const sizeClasses = {
    small: 'w-16 h-16 sm:w-20 sm:h-20',
    medium: 'w-20 h-20 sm:w-24 sm:h-24',
    large: 'w-24 h-24 sm:w-32 sm:h-32',
    enlarged: 'w-40 h-40 sm:w-56 sm:h-56',
  };

  // Generate QR after the first click (when clickStep becomes 1)
  useEffect(() => {
    if (clickStep !== 1) return;

    const generateQRCode = async () => {
      if (!shortCode) {
        setError('No shortcode provided');
        setLoading(false);
        return;
      }
      
      // Check if we have a submissionId
      if (!submissionId) {
        setError('Submission ID not available yet');
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError('');
        
        // Get access token from localStorage
        const accessToken = localStorage.getItem('access') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwic3VibWlzc2lvbl9pZCI6IjIiLCJqdGkiOiJmNWM3M2Y1NzM5NDc0YTIyOTQ1MzgwOGUxMDkxNTY2NCIsImlhdCI6MTc2MjQzNjExMCwibmJmIjoxNzYyNDM2MTEwLCJleHAiOjE3NjI0NzIxMTAsImlzcyI6IkFyY29uLklEVi5BUEkiLCJhdWQiOiJBcmNvbi5JRFYuQ2xpZW50In0.ASHPD25bzLVLXdlfrm0Qh-C02QC5kyf3RUwQI72dDJ8';
        
        // Store submissionId in localStorage for future reference
        localStorage.setItem('submissionId', submissionId.toString());
        
        // Call the handoff API to get join code
        const handoffResponse = await fetch('http://10.10.5.231:5027/api/handoff/start', {
          method: 'POST',
          headers: {
            'accept': 'text/plain',
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            submissionId: submissionId,
            ttlSeconds: 1000000
          })
        });

        if (!handoffResponse.ok) {
          const errorText = await handoffResponse.text();
          throw new Error(`Failed to start handoff: ${errorText}`);
        }

        const handoffData = await handoffResponse.json();
        const joinCode = handoffData.joinCode;
        
        console.log('Handoff API Response:', handoffData);
        console.log('Join Code:', joinCode);
        
        // Generate QR code with join code URL
        const baseUrl = 'http://10.10.5.231:4200';
        const qrUrl = `${baseUrl}/HandoffPage/${joinCode}`;
        
        const options: QRCodeOptions = {
          shortCode: joinCode, // Use join code instead of shortCode
          templateVersionId,
          userId,
          sessionId,
          currentStep,
        };
        const dataUrl = await generateQRCodeDataURL(options);
        setQrCodeDataUrl(dataUrl);

        // Build human-readable URL with join code
        setVerificationUrl(qrUrl);

        // Connect to SignalR WebSocket
        await connectToSignalR(accessToken, submissionId);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
        setError('Failed to generate QR code');
      } finally {
        setLoading(false);
      }
    };

    generateQRCode();
  }, [clickStep, shortCode, templateVersionId, userId, sessionId, currentStep, submissionId]);

  // SignalR WebSocket connection
  const connectToSignalR = async (accessToken: string, submissionId: number) => {
    try {
      // Close existing connection if any
      if (connectionRef.current) {
        await connectionRef.current.stop();
      }

      // Auto-detect device fingerprint (Desktop vs Mobile)
      const deviceFingerprint = getDeviceFingerprint();
      const deviceType = window.location.pathname.includes('/HandoffPage/') ? 'Mobile (Device 2)' : 'Desktop (Device 1)';
      console.log(`🔑 ${deviceType} Device Fingerprint for SignalR:`, deviceFingerprint);

      // Build SignalR connection
      const connection = new signalR.HubConnectionBuilder()
        .withUrl(`ws://10.10.5.231:5027/hubs/handoff?access_token=${accessToken}`, {
          skipNegotiation: true,
          transport: signalR.HttpTransportType.WebSockets,
          // Add timeout and keep-alive settings
          timeout: 60000, // 60 seconds timeout
          // Add custom headers including device fingerprint
          headers: {
            'X-Device-Fingerprint': deviceFingerprint
          }
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (retryContext) => {
            // Exponential backoff: 0, 2, 10, 30 seconds
            if (retryContext.previousRetryCount === 0) return 0;
            if (retryContext.previousRetryCount === 1) return 2000;
            if (retryContext.previousRetryCount === 2) return 10000;
            return 30000;
          }
        })
        .configureLogging(signalR.LogLevel.Debug) // Changed to Debug for more info
        .build();

      // Handle reconnection
      connection.onreconnecting((error) => {
        console.log('🔄 SignalR reconnecting...', error);
        console.log('🔄 Reconnection attempt due to:', error?.message || 'Unknown reason');
        toast({
          title: "Reconnecting...",
          description: "Connection lost, attempting to reconnect.",
          duration: 3000,
        });
      });

      connection.onreconnected((connectionId) => {
        console.log('✅ SignalR reconnected with connectionId:', connectionId);
        toast({
          title: "✅ Reconnected",
          description: "Connection restored successfully.",
          duration: 3000,
        });
      });

      connection.onclose((error) => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ SignalR CONNECTION CLOSED');
        console.error('❌ Close reason:', error?.message || 'No error provided');
        console.error('❌ Error details:', error);
        console.error('❌ Connection was in state:', connection.state);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Clear heartbeat interval when connection closes
        const interval = (connection as any)._heartbeatInterval;
        if (interval) {
          clearInterval(interval);
          console.log('🛑 Heartbeat interval cleared on connection close');
        }
        
        if (error) {
          toast({
            title: "❌ Connection Lost",
            description: `Connection closed: ${error.message}`,
            variant: "destructive",
            duration: 5000,
          });
        } else {
          console.log('ℹ️ Connection closed gracefully (no error)');
        }
      });

      // Listen for file upload completed events
      connection.on('file.upload.completed', (data: any) => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔔 SignalR Updated: file.upload.completed');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📨 RAW Data:', data);
        console.log('✅ File Upload Completed:');
        console.log('   📄 File Name:', data.fileName);
        console.log('   🆔 File ID:', data.fileId);
        console.log('   📋 Submission ID:', data.submissionId);
        console.log('   📑 Document Definition ID:', data.documentDefinitionId);
        console.log('   📦 Size (bytes):', data.sizeBytes);
        console.log('   📂 Storage Path:', data.storagePath);
        console.log('   ⏰ Uploaded At:', data.uploadedAtUtc);
        console.log('   🏷️  Content Type:', data.contentType);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        toast({
          title: "📎 File Uploaded",
          description: `Document uploaded: ${data.fileName || 'Unknown file'}`,
          duration: 4000,
        });
      });

      // Listen for generic notifications (if backend sends any)
      connection.on('ReceiveNotification', (message: string) => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔔 SignalR Updated: ReceiveNotification');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📨 RAW Message:', message);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        toast({
          title: "📨 Notification",
          description: message.length > 100 ? message.substring(0, 100) + '...' : message,
          duration: 3000,
        });
      });

      console.log('📡 Registered handlers for: file.upload.completed, ReceiveNotification');

      // Start connection
      await connection.start();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ SignalR CONNECTED to handoff hub');
      console.log('✅ Connection State:', connection.state);
      console.log('✅ Connection ID:', connection.connectionId);
      console.log('✅ Transport:', 'WebSockets');
      console.log('✅ Submission ID:', submissionId);
      console.log('✅ Device Fingerprint:', deviceFingerprint);
      console.log('✅ Access Token (first 50 chars):', accessToken.substring(0, 50) + '...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Try to explicitly subscribe to notifications for this submission
      // The backend might auto-register based on the JWT token, but let's try explicitly
      try {
        console.log('📞 Attempting to invoke JoinSubmission on hub with submissionId:', submissionId);
        await connection.invoke('JoinSubmission', submissionId);
        console.log('✅ Successfully joined submission:', submissionId);
      } catch (invokeError: any) {
        console.warn('⚠️ JoinSubmission method not available or failed:', invokeError.message);
        console.log('ℹ️ Backend might auto-register based on JWT token in URL');
      }
      
      // Connection successful - the server should automatically associate this connection
      // with the submission based on the access token in the URL
      toast({
        title: "🔗 Connected",
        description: `Real-time updates enabled for submission:${submissionId}`,
        duration: 3000,
      });

      connectionRef.current = connection;

      // Optional: Send periodic heartbeat to keep connection alive
      // This prevents idle timeout on some networks/proxies
      const heartbeatInterval = setInterval(() => {
        if (connection.state === signalR.HubConnectionState.Connected) {
          console.log('💓 Heartbeat - Connection still alive');
        } else {
          console.warn('⚠️ Heartbeat - Connection not in Connected state:', connection.state);
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Every 30 seconds

      // Store interval reference for cleanup
      (connection as any)._heartbeatInterval = heartbeatInterval;
    } catch (err) {
      console.error('❌ SignalR connection failed:', err);
      toast({
        title: "Connection Error",
        description: "Failed to connect to real-time updates.",
        variant: "destructive",
        duration: 4000,
      });
    }
  };

  // DON'T cleanup SignalR connection on unmount - keep it alive!
  // This allows the connection to persist when closing/reopening document dialogs
  // Connection will only close when user submits the form or navigates away from page
  useEffect(() => {
    return () => {
      console.log('⚠️ QRCodeDisplay unmounting - keeping SignalR connection alive');
      // Intentionally NOT stopping the connection here
      // The connection will persist in memory and continue receiving events
    };
  }, []);

  // Close enlarged modal on Escape
  useEffect(() => {
    if (clickStep !== 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClickStep(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clickStep]);

  const handleClickBase = () => {
    if (clickStep === 0) setClickStep(1);                // first click -> generate
    else if (clickStep === 1 && qrCodeDataUrl) setClickStep(2); // second click -> enlarge
  };

  // Loading state
  if (loading) {
    return (
      <div className={`flex justify-center items-center ${sizeClasses[size]} ${className}`}>
        <Spinner className="rounded-full h-8 w-8 text-[#0073EA]" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex flex-col justify-center items-center ${sizeClasses[size]} ${className} bg-gray-100 rounded-lg`}>
        <ErrorOutline className="w-6 h-6 text-gray-400 mb-1" />
        <span className="text-xs text-gray-500 text-center">QR Error</span>
      </div>
    );
  }

  // Step 0: blurred placeholder (click to generate)
  if (clickStep === 0) {
    return (
      <div
        className={`relative flex items-center justify-center cursor-pointer ${sizeClasses[size]} ${className}`}
        onClick={handleClickBase}
        style={{ userSelect: 'none' }}
        title="Click to generate QR"
      >
        <div className="absolute inset-0 flex items-center justify-center bg-white rounded-lg overflow-hidden">
          {/* Blurred, fake QR placeholder */}
          <div className="w-full h-full flex items-center justify-center">
            <svg width="100%" height="100%" viewBox="0 0 120 120" className="block">
              <rect x="0" y="0" width="120" height="120" rx="16" fill="#e5e7eb" />
              <rect x="20" y="20" width="80" height="80" fill="#d1d5db" />
              <rect x="40" y="40" width="40" height="40" fill="#9ca3af" />
            </svg>
          </div>
          <div className="absolute inset-0 backdrop-blur-sm bg-white/60 flex items-center justify-center rounded-lg">
            <span className="text-base font-semibold text-gray-700">Click to Generate</span>
          </div>
        </div>
      </div>
    );
  }

  // Base (step 1): QR shown small/medium/large; click to enlarge
  const baseViewStep1 = (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {qrCodeDataUrl ? (
        <img
          src={qrCodeDataUrl}
          alt="QR Code for verification"
          className={`${sizeClasses[size]} object-contain rounded-lg border-2 border-white shadow-lg bg-white p-2 transition-all duration-200 cursor-zoom-in`}
          onClick={() => setClickStep(2)}
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
          {verificationUrl.length > 40 ? `${verificationUrl.substring(0, 40)}...` : verificationUrl}
        </div>
      )}
    </div>
  );

  // Overlay (step 2): enlarged modal on top of whatever is underneath
  const overlayStep2 = (clickStep === 2 && qrCodeDataUrl) ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.currentTarget === e.target) setClickStep(1); // backdrop click closes
      }}
    >
      <div className="relative p-4 bg-white rounded-lg shadow-2xl">
        {/* Close button */}
        <button
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-black/80 text-white flex items-center justify-center"
          onClick={() => setClickStep(1)}
          aria-label="Close enlarged QR"
        >
          ×
        </button>

        <img
          src={qrCodeDataUrl}
          alt="Enlarged QR Code"
          className={`${sizeClasses.enlarged} object-contain rounded-lg border border-gray-200`}
        />

        {showUrl && verificationUrl && (
          <div className="mt-3 text-xs text-[#0073EA] text-center break-all max-w-[320px] mx-auto">
            {verificationUrl}
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {baseViewStep1}
      {overlayStep2}
    </>
  );
}
