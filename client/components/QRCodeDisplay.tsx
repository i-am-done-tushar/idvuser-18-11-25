import { useState, useEffect, useRef } from 'react';
import { ErrorOutline, Spinner, CloseIcon } from './SVG_Files';
import { CheckCircle } from 'lucide-react';
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
  onConnected?: () => void; // 👈 NEW
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
  const [handoffResolved, setHandoffResolved] = useState(false);
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

  // Function to clear saved join code for this submission
  const clearSavedJoinCode = (submissionId: number) => {
    const savedJoinCodeKey = `joinCode_${submissionId}`;
    localStorage.removeItem(savedJoinCodeKey);
    console.log('Cleared saved join code for submission:', submissionId);
  };

  // Check if join code exists on mount and auto-generate QR if it does
  useEffect(() => {
    if (submissionId) {
      const savedJoinCodeKey = `joinCode_${submissionId}`;
      const existingJoinCode = localStorage.getItem(savedJoinCodeKey);
      
      if (existingJoinCode) {
        console.log('Found existing join code, auto-generating QR:', existingJoinCode);
        setClickStep(1); // Automatically trigger QR generation
      }
    }
  }, [submissionId]);

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
      
      // Declare variables for error handling
      let joinCode: string | null = null;
      let savedJoinCodeKey: string = '';
      
      try {
        setLoading(true);
        setError('');
        
        // Get access token from localStorage
        const accessToken = localStorage.getItem('access');
        
        // Check if we already have a saved join code for this submission
        savedJoinCodeKey = `joinCode_${submissionId}`;
        joinCode = localStorage.getItem(savedJoinCodeKey);
        
        if (!joinCode) {
          // Store submissionId in localStorage for future reference
          localStorage.setItem('submissionId', submissionId.toString());
          
          // Call the handoff API to get join code
          const handoffResponse = await fetch('https://idvapi-test.arconnet.com:1019/api/handoff/start', {
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
          joinCode = handoffData.joinCode;
          
          // Save the join code in localStorage for future use
          localStorage.setItem(savedJoinCodeKey, joinCode);
          
          console.log('Handoff API Response:', handoffData);
          console.log('New Join Code generated and saved:', joinCode);
        } else {
          console.log('Using saved Join Code:', joinCode);
        }
        
        // Generate QR code with join code URL
        //QR code URL
        const baseUrl = 'https://idvuser-test.arconnet.com:1017 ';
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
        
        // If there's an error and we were using a saved join code, clear it so we can regenerate
        if (joinCode && localStorage.getItem(savedJoinCodeKey) === joinCode) {
          clearSavedJoinCode(submissionId);
        }
        
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
      // Build SignalR connection. Note:
      // - The 'timeout' option passed into withUrl is not a valid option for
      //   the SignalR client and causes unexpected behavior. We therefore
      //   remove it and instead configure the client's timeout/keep-alive
      //   properties directly after building the connection.

      // const websocketBaseUrl = 'wss://idvapi-test.arconnet.com:1019/hubs/handoff';
      // const connection = new signalR.HubConnectionBuilder()
      //   .withUrl(`${websocketBaseUrl}?access_token=${accessToken}`, {


      // Websocket base URL
      const websocketBaseUrl = 'wss://idvapi-test.arconnet.com:1019/hubs/handoff';
      const connection = new signalR.HubConnectionBuilder()
        .withUrl(`${websocketBaseUrl}?access_token=${accessToken}`, {
          skipNegotiation: true,
          transport: signalR.HttpTransportType.WebSockets,
          // Add custom headers including device fingerprint
          headers: {
            'X-Device-Fingerprint': deviceFingerprint
          }
        })
        .configureLogging(signalR.LogLevel.Debug)
        .build();


      // Increase client-side timeouts to reduce spurious "Server timeout"
      // disconnects. These values are client-side only and don't change
      // any server behaviour. Keep them reasonable; extremely large values
      // hide real connectivity problems.
      // Default serverTimeoutInMilliseconds is 30_000 (30s). We'll increase
      // to 5 minutes here. keepAliveIntervalInMilliseconds controls how
      // often the client will send keepalives; set to 15s.
      try {
        (connection as any).serverTimeoutInMilliseconds = 5 * 60 * 1000; // 5 minutes
        (connection as any).keepAliveIntervalInMilliseconds = 15 * 1000; // 15 seconds
      } catch (e) {
        // Some SignalR builds may not allow writing these properties; ignore
        // if not present and rely on a manual heartbeat below.
        console.warn('Could not set client timeout/keep-alive properties', e);
      }

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

      // Listen for personal information update events
      connection.on('personal.updated', (data: any) => {
        console.log('🔔 personal.updated - RAW Data:', JSON.stringify(data, null, 2));
        
        toast({
          title: "📝 Personal Info Updated",
          description: `Personal information has been updated from another device`,
          duration: 4000,
        });
      });

      // Listen for file upload completed events
      connection.on('file.upload.completed', (data: any) => {
        console.log('🔔 file.upload.completed - RAW Data:', JSON.stringify(data, null, 2));
        
        toast({
          title: "📎 File Uploaded",
          description: `Document uploaded: ${data.data?.fileName || 'Unknown file'}`,
          duration: 4000,
        });
      });

      // Listen for handoff resolved events
      connection.on('handoff.resolved', (data: any) => {
        console.log('🔔 handoff.resolved - RAW Data:', JSON.stringify(data, null, 2));
        
        setHandoffResolved(true);
        toast({
          title: "✅ QR Code Scanned",
          description: "This QR code has been scanned on another device. Please continue verification there.",
          duration: 5000,
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

      console.log('📡 Registered handlers for: personal.updated, file.upload.completed, ReceiveNotification');

      // Start connection
      await connection.start();
      // expose connection and notify parent
      if (props.connectionRef) props.connectionRef.current = connection;
      if (props.onConnected) props.onConnected(); // 👈 NEW
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

      // Optional: Send periodic heartbeat to keep connection alive.
      // A local console-only heartbeat is insufficient to prevent
      // "Server timeout elapsed without receiving a message from the server".
      // If the server exposes a lightweight ping method (e.g. 'Ping'), we
      // attempt to invoke it periodically. If the server does not expose
      // such a method the invoke will fail and we silently ignore the
      // error — this is safe and keeps behaviour robust across backends.
      const heartbeatInterval = setInterval(async () => {
        if (connection.state === signalR.HubConnectionState.Connected) {
          try {
            // Try a no-op/ping invoke. If server doesn't support it, we'll
            // receive an error which we ignore — the goal is to create
            // outbound activity so both sides consider the connection active.
            await connection.invoke('Ping');
            console.log('💓 Heartbeat - Ping invoked');
          } catch (err) {
            // Ignore errors from missing server method; still useful to
            // have the attempt logged for diagnostics.
            console.log('💓 Heartbeat - ping invoke failed or not supported', err?.message || err);
          }
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

  const handleClickBase = (e?: React.MouseEvent) => {
    // If Ctrl+click or double-click, clear saved join code and regenerate
    if (e && (e.ctrlKey || e.detail === 2)) {
      clearSavedJoinCode(submissionId);
      setQrCodeDataUrl(''); // Clear current QR to force regeneration
      setVerificationUrl('');
      setClickStep(0); // Reset to initial state
      setTimeout(() => setClickStep(1), 100); // Trigger regeneration
      return;
    }
    
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

  // Handoff resolved state - show message instead of QR
  if (handoffResolved) {
    return (
      <div className={`flex flex-col justify-center items-center ${sizeClasses[size]} ${className} bg-green-50 rounded-lg border-2 border-green-200`}>
        <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
        <span className="text-sm font-medium text-green-800 text-center px-2">
          QR Code Scanned
        </span>
        <span className="text-xs text-green-600 text-center px-2 mt-1">
          Continue verification on the other device
        </span>
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
