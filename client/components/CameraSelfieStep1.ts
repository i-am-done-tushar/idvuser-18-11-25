import { Component, HostListener, EventEmitter, Input, ElementRef, ViewChild, Output, OnDestroy } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import * as faceapi from 'face-api.js';
//import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LogService, LogLevel } from '../../log.service';
import { FormsModule } from '@angular/forms';
import * as tf from '@tensorflow/tfjs';
//import { FaceLandmarker, FilesetResolver, FaceLandmarkerOptions, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { HttpClientModule } from '@angular/common/http';
interface FaceGuideOval {
  cx: number;
  cy: number;
  rOuter: number;
  rInner: number;
  w: number;
  h: number;
}
interface SegmentSubPart {
  blob: Blob;
  startTime: number;
  endTime: number;
  duration: number;
}
interface PartialSegmentBlob {
  blob: Blob;           // actual binary
  startTime: number;    // in seconds
  endTime: number;      // in seconds
  duration: number;     // computed duration
}
declare var cv: any; // OpenCV.js
@Component({
  selector: 'app-step6',
  standalone: true,
  imports: [CommonModule, NgIf, FormsModule, HttpClientModule],
  templateUrl: './step6.component.html',
  styleUrls: ['./step6.component.css'],
})


export class Step6Component implements OnDestroy {

 
/* --------------------------------------------------
* 🔹 Constructor & Injections
* -------------------------------------------------- */
  constructor(
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private logService: LogService
  ) { }

/* --------------------------------------------------
* 🔹 Inputs/Outputs (Angular Bindings)
* -------------------------------------------------- */
  @Input() userId!: number;                 // Provided by parent component
  @Output() stepComplete = new EventEmitter<number>(); // Emits when process finishes

/* --------------------------------------------------
* 🔹 Template Refs
* -------------------------------------------------- */
  @ViewChild('videoEl', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('overlay', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;


/* --------------------------------------------------
* 🔹 UI / State Variables
* -------------------------------------------------- */
  isCameraOn = false;               // Toggled by startCamera()
  isFaceDetected = false;           // Updated in detection loop
  statusMessage = '';               // General status shown in UI
  dashedCircleAlignMessage = '';    // Face alignment guide
  cameraErrorMessage = '';          // Camera error messages
  brightnessMessage = '';           // Light issues
  ovalAlignMessage = '';            // Oval-face guide
  distanceMessage = '';             // Distance guide
  recordingMessage = '';            // Updates during recording
  verificationMessage = '';         // Head-turn/other verification prompts
  showFaceMismatchModal = false;    // Modal display handler
  mobileStatusMessage = '';         // Mobile condensed single message
  showSuccessScreen = false;        // Final success view
  isMobile: boolean = false;

/* --------------------------------------------------
* 🔹 Recording / Media Variables
* -------------------------------------------------- */
  isRecording = false;                          // Active recording session
  currentSegment = 0;                           // Which segment is being recorded
  totalSegments = 3;                            // Fixed number of segments
  segmentDurations: number[] = [];              // Segment length distribution
  timeRemaining = 0;                            // Updated by timer
  segmentSecondsRecorded = 0;                   // Current segment elapsed time
  extraSecondsRecorded = 0;                     // Buffer second if needed
  continuousRecordingBlobs: Blob[] = [];        // For continuous mode (not segmented)
  completedSegments: Blob[] = [];               // Finished blobs per segment
  recordedChunksPerSegment: Record<number,Blob[]> = {}; // Active chunk buffer
  private recordingFlag = 0;
  private isSegmentValid: boolean = true;
  private fillBuffer: number[] = [];
  private smoothingWindow = 5;
  private faceMismatchCounter: number = 0;
  private readonly faceMismatchThreshold: number = 3; // seconds required for mismatch

  /* Head-Turn Recording */
  headMediaRecorder?: MediaRecorder;            // Separate recorder for verification
  headRecordedChunks: Blob[] = [];              // Chunks for head-turn recording
  headTurnBlob: Blob | null = null;             // Final verification blob
  headSegmentSecondsRecorded = 0;               // Head-turn video seconds
  headTurnDirection!: 'left'|'right'|'up'|'down'; // Current verification direction
  headTurnAttempts = 0;                         // Attempts done
  maxHeadTurnAttempts = 2;                      // Allowed attempts
  headTurnAttemptsPerSegment: { [n: number]: number } = {};
  headTurnVerified = false;                     // Boolean result
  HeadTurnRecordingDone = false;                // Status
  HeadTurnRecordingFailed = false;              // Status
  headVerificationCountPerSegment: { [s: number]: number } = {};
  showHeadTurnPrompt = false;
  headTurnAttemptStatus = '';
  isVerifyingHeadTurn = false;
  direction!: 'left' | 'right' | 'up' | 'down';
  VerificationStatus = false;


  /* Partial Recording Handling */
  private partialSegmentBlobsPerSegment: { [segment: number]: PartialSegmentBlob[] } = {};
  segmentSubParts: { [key: number]: SegmentSubPart[] } = {}; // Raw slice storage
  currentSubPartStartTime = 0;
  private currentSessionStartTime = 0;          // For resuming
  private _stoppingForRestart = false;          // Restart flag
  private _restartCooldown = false;             // Anti-spam restart flag
  private _lastAdjustedSegmentSecondsRecorded: number | null = null;


/* --------------------------------------------------
* 🔹 Detection / FaceAPI State
* -------------------------------------------------- */
  private videoElement!: HTMLVideoElement;
  private overlayCanvas!: HTMLCanvasElement;
  private stream!: MediaStream;
  private mediaRecorder!: MediaRecorder | null;
  private referenceFaceDescriptor: Float32Array | null = null; // Used by startRecording_FaceReference

  /* For face alignment oval & vision analysis */
  private oval: FaceGuideOval = { cx:0,cy:0,rOuter:0,rInner:0,w:0,h:0 };
  private ovalProgress = 0;

  /* Brightness/Blur Analysis */
  private brightnessCanvas!: HTMLCanvasElement;
  private brightnessCtx!: CanvasRenderingContext2D | null;
  private currentBrightness: number = 100;

  /* State used in RAF detection loop */
  private rafId: number | null = null;
  private frameCount = 0;
  private DETECT_EVERY = 1;     // Do face detection frequency
  private BRIGHT_EVERY = 6;     // Do brightness check frequency
  private insideOvalFrames = 0; // Counter for stable detection
  private requiredFrames = 3;   // Threshold inside oval
  private recordedFrameCount = 0;
  private lastLandmarks: faceapi.FaceLandmarks68 | null = null;
  private lastBox: faceapi.Box | null = null;

  /* Blink & EAR analysis (used in face detection) */
  private blinkClosed = false;
  blinkCount = 0;
  baselineEARs: number[] = [];
  private prevEAR?: number;
  private minEAR = Number.POSITIVE_INFINITY;
  private maxEAR = Number.NEGATIVE_INFINITY;

  /* Head/pose estimation values (updated in runVerification loop) */
  private lastYaw?: number;
  private lastPitch?: number;

  /* Verification Flags */
  verificationDoneForSegment: { [segment: number]: boolean } = {};
  verificationTriggeredForSegment: { [segment: number]: boolean } = {};
  verificationSuccessForSegment: { [segment: number]: boolean } = {};
  performVerificationForCurrentSegment = false;
  verificationTimeInSegment = 0;
  firstVerificationDirection: 'up'|'down'|'left'|'right'|null = null;
  secondVerificationDirection: 'up'|'down'|'left'|'right'|null = null;
  thirdVerificationDirection: 'up'|'down'|'left'|'right'|null = null;
  triggerVerification3 = false;

  /* Detection Loop UX (Blinking overlay used in head turn guidance) */
  private blinkingDirection: 'left'|'right'|'up'|'down'|null = null;
  private blinkVisible = false;
  private blinkIntervalId: any = null;


  /* --------------------------------------------------
   * 🔹 Logging / Debug
   * -------------------------------------------------- */
  selectedLevel: LogLevel = 'debug';
  logs: string = '';
  private debug = true;
  private messageCooldowns: { [key:string]: boolean } = {};
  private totalDuration = 10; // Total length 10s

  /* Timer handle */
  private timerInterval: any;





  
/* --------------------------------------------------
* 🔹 Lifecycle Hooks
* -------------------------------------------------- */
  async ngOnInit() {
    try {
      this.checkIsMobile();
      console.log('Setting TensorFlow.js backend to webgl...');
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('TensorFlow backend:', tf.getBackend());

      console.log('Loading face-api models...');
      this.logService.log("debug", "Loading face-api models...");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/assets/weights'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/assets/weights'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/assets/weights'),
        faceapi.nets.faceExpressionNet.loadFromUri('/assets/weights')
      ]);
      console.log('✅ FaceAPI models loaded');

      this.logService.log("debug", "✅ FaceAPI models loaded");
      console.log('Loading COCO-SSD model...');
      //this.cocoModel = await cocoSsd.load();
      console.log('✅ COCO-SSD model loaded');
      this.logService.log('info', 'Step 6 loaded');
      this.logs = this.logService.getLogs();
      console.log('Starting camera...');

      await this.startCamera();



    } catch (err: any) {
      console.error("Camera initialization failed:", err);

      if (err.name === "NotAllowedError") {
        this.cameraErrorMessage = "❌ Camera permission denied. Please allow access and refresh.";
      } else if (err.name === "NotFoundError") {
        this.cameraErrorMessage = "⚠️ No camera found on this device.";
      } else {
        this.cameraErrorMessage = "⚠️ Failed to access the camera. Try again.";
      }

      this.isCameraOn = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
  }


/* --------------------------------------------------
* 🔹 UI Helper Methods
* -------------------------------------------------- */
  private showMessage(
    key: string,
    msg: any,
    autoHide: boolean = false,
    duration: number = 2000,
    cooldownDuration: number = 1000
  ) {
    // Normalize key: if empty or not a property on this, fallback to statusMessage to avoid silent failures
    if (!key || !Object.prototype.hasOwnProperty.call(this, key)) {
      console.warn(`⚠️ Unknown or empty message key provided: ${key}. Falling back to 'statusMessage'.`);
      key = 'statusMessage';
    }

    // Ensure message is always a string to avoid showing [object Object] in the UI
    let text: string;
    try {
      if (typeof msg === 'string') {
        text = msg;
      } else if (msg === null || msg === undefined) {
        text = '';
      } else if (typeof msg === 'object') {
        text = JSON.stringify(msg);
      } else {
        text = String(msg);
      }
    } catch (e) {
      text = String(msg);
    }

    if (this.messageCooldowns[key]) {
      return;
    }

    const currentVal = (this as any)[key];

    if (currentVal === text) {
      return;
    }

    if (this.isMobile) {
      // On mobile: update only the mobileStatusMessage with the latest message
      this.mobileStatusMessage = text;

      // Also clear the specific full status message to avoid showing bubbles
      (this as any)[key] = '';

    } else {
      // On desktop/tablet: update the full status bubble message normally
      (this as any)[key] = text;

      // Clear mobile message if any
      this.mobileStatusMessage = '';
    }

    if (autoHide) {
      setTimeout(() => {
        if ((this as any)[key] === text) {
          (this as any)[key] = '';

          if (this.isMobile && this.mobileStatusMessage === text) {
            this.mobileStatusMessage = '';
          }

          this.messageCooldowns[key] = true;

          setTimeout(() => {
            this.messageCooldowns[key] = false;
          }, cooldownDuration);
        }
      }, duration);
    }
  }

  private showAndLogMessage(id: string, msg: string, level: 'info' | 'warn' | 'error', loop: () => void): boolean {/* Displays a message, logs it with the specified level,
   * restarts the current segment if recording, and schedules next detection loop.
   * @param id The message container ID.
   * @param msg The message text to display.
   * @param level The log level ('info', 'warn', 'error').
   * @param loop The detection loop function to schedule next iteration.
   * @returns Always returns true to signal stopping current processing.
   */
    this.showMessage(id, msg);
    this.logService.log(level, msg);

    if (this.isRecording) {
      this._restartCurrentSegmentDueToFaceLoss();
    }

    this.scheduleNext(loop);
    return true;
  }

  showModal(title: string, message: string) {
    // Optional: handle title/message dynamically if you want
    this.showFaceMismatchModal = true;
  }

  closeFaceMismatchModal() {
    this.showFaceMismatchModal = false;
  }


  /* --------------------------------------------------
   * 🔹 Logging / Error Simulation
   * -------------------------------------------------- */

  simulateError() {
  try {
    throw new Error('Testing error in FaceDetection Component');
  } catch (error: any) {
    this.logService.log('error', error.message);
    this.logs = this.logService.getLogs();
  }
  }

  downloadLogs() {
    this.logService.downloadLogs();
  }

  onLogLevelChange(event: Event) {
  const selectElement = event.target as HTMLSelectElement;
  const value = selectElement.value as LogLevel;
  this.logService.setLogLevel(value);
  }


  /* --------------------------------------------------
   * 🔹 Camera Handling
   * -------------------------------------------------- */
  private async startCamera() {
    try {
      this.videoElement = this.videoRef.nativeElement;
      this.overlayCanvas = this.overlayRef.nativeElement;

      this.logService.log('info', 'Starting camera...');

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.logService.log('info', 'Camera stream acquired and video playback started.');

      // Check actual video settings
      const videoTracks = this.stream.getVideoTracks();
      if (videoTracks.length) {
        const settings = videoTracks[0].getSettings();
        this.logService.log('debug', `Camera settings: ${JSON.stringify(settings)}`);

        if ((settings.width && settings.width < 400) || (settings.height && settings.height < 300)) {
          const msg = "⚠️ Low camera resolution. Face detection may not work properly.";
          this.showMessage('cameraErrorMessage', msg);
          this.logService.log('warn', msg);
        }

        if (settings.frameRate && settings.frameRate < 15) {
          const msg = "⚠️ Low frame rate. Detection quality may be affected.";
          this.showMessage('cameraErrorMessage', msg);
          this.logService.log('warn', msg);
        }
      }

      // Check measured FPS
      const fps = await this.checkCameraFPS();
      this.logService.log('debug', `Measured camera FPS: ${fps}`);

      if (fps < 15) {
        const msg = '⚠️ Camera FPS is too low for reliable detection.';
        this.showMessage('cameraErrorMessage', msg);
        this.logService.log('warn', msg);
      }

      // Validate stream
      if (!this.videoElement.srcObject || !(this.videoElement.srcObject instanceof MediaStream)) {
        const msg = "⚠️ Camera not providing video. Try refreshing or switching device.";
        this.showMessage('cameraErrorMessage', msg);
        this.logService.log('error', msg);
        return;
      }

      this.isCameraOn = true;
      const successMsg = '📷 Camera started successfully.';
      this.showMessage('recordingMessage', successMsg);
      this.logService.log('info', successMsg);

      this.checkVideoResolution();

      // Setup overlay canvas and brightness canvas
      const setupOverlay = () => {
        const w = this.videoElement.videoWidth || 640;
        const h = this.videoElement.videoHeight || 480;
        this.overlayCanvas.width = w;
        this.overlayCanvas.height = h;

        this.oval.w = w * 0.5;
        this.oval.h = h * 0.6;
        this.oval.cx = w / 2;
        this.oval.cy = h / 2;

        if (!this.brightnessCanvas) this.brightnessCanvas = document.createElement('canvas');
        this.brightnessCanvas.width = w;
        this.brightnessCanvas.height = h;
        this.brightnessCtx = this.brightnessCanvas.getContext('2d');

        this.logService.log('debug', `Overlay and brightness canvas set up with dimensions: ${w}x${h}`);
      };

      setupOverlay();
      this.videoElement.addEventListener('loadedmetadata', setupOverlay, { once: true });
      this.generateSegmentDurations();
      this.startDetectionRAF();
      this.logService.log('info', 'Started detection loop via requestAnimationFrame.');

    } catch (err: any) {
      const errorMsg = `Camera initialization failed: ${err.message || err}`;
      this.logService.log('error', errorMsg);
      console.error(errorMsg);

      if (err.name === "NotAllowedError") {
        const msg = "❌ Camera permission denied. Please allow access and refresh.";
        this.showMessage('cameraErrorMessage', msg);
        this.logService.log('error', msg);
      } else if (err.name === "NotFoundError") {
        const msg = "⚠️ No camera found on this device.";
        this.showMessage('cameraErrorMessage', msg);
        this.logService.log('error', msg);
      } else {
        const msg = "⚠️ Failed to access the camera. Try again.";
        this.showMessage('cameraErrorMessage', msg);
        this.logService.log('error', msg);
      }

      this.isCameraOn = false;
      this.cdr.detectChanges();
    }
  }

  private async checkCameraFPS() {
    return new Promise<number>((resolve) => {
      let frameCount = 0;
      let startTime = performance.now();

      const countFrame = () => {
        frameCount++;
        const elapsed = performance.now() - startTime;
        if (elapsed >= 1000) {
          resolve(frameCount);
        } else {
          requestAnimationFrame(countFrame);
        }
      };

      countFrame();
    });
  }

  private checkVideoResolution() {
    const width = this.videoElement.videoWidth;
    const height = this.videoElement.videoHeight;

    console.log(`📷 Video resolution: ${width}x${height}`);
    if (width < 400 || height < 300) {
      this.showMessage('cameraErrorMessage', "⚠️ Low camera resolution. Face detection may not work properly.");
    }
  }

  private isVideoBlurred(): boolean {
    if (!this.brightnessCtx) return false;

    this.brightnessCtx.drawImage(this.videoElement, 0, 0, this.brightnessCanvas.width, this.brightnessCanvas.height);
    const imageData = this.brightnessCtx.getImageData(0, 0, this.brightnessCanvas.width, this.brightnessCanvas.height);
    const pixels = imageData.data;

    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += brightness;
      sumSq += brightness * brightness;
    }

    const mean = sum / (pixels.length / 4);
    const variance = sumSq / (pixels.length / 4) - mean * mean;

    return variance < 50; // tweak this threshold if needed
  }

  private isVideoBlank(): boolean {
    if (!this.brightnessCtx) return true;

    this.brightnessCtx.drawImage(this.videoElement, 0, 0, this.brightnessCanvas.width, this.brightnessCanvas.height);
    const imageData = this.brightnessCtx.getImageData(0, 0, this.brightnessCanvas.width, this.brightnessCanvas.height).data;

    let blackPixels = 0;
    const threshold = 30;
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      if (r < threshold && g < threshold && b < threshold) {
        blackPixels++;
      }
    }

    const blackPercent = blackPixels / (imageData.length / 4);
    return blackPercent > 0.95;
  }

  @HostListener('window:resize')
  onResize() {
    this.checkIsMobile();
  }

  private checkIsMobile() {
    this.isMobile = window.innerWidth <= 767;
  }


  /* --------------------------------------------------
   * 🔹 Face Detection Loop (RAF)
   * -------------------------------------------------- */

  private startDetectionRAF(): void {/*Starts the real-time face detection loop using `requestAnimationFrame`.
   * Handles brightness, face alignment, size validation, and recording initiation.
   */
    this.logService.log('info', '🔄 Starting face detection loop...');
    const options = new faceapi.TinyFaceDetectorOptions();

    const loop = async () => {
      // Validate camera and video readiness
      if (!this.validateCameraAndVideo(loop)) return;

      // Ensure oval guide is initialized
      if (!this.validateOval(loop)) return;

      this.frameCount++;

      // Perform brightness and image quality checks at intervals
      if (this.frameCount % this.BRIGHT_EVERY === 0) {
        if (await this.handleBrightnessChecks(loop)) return;
      }

      // Detect all faces periodically to check for multiple faces
      if (this.frameCount % this.DETECT_EVERY === 0) {
        if (await this.checkMultipleFaces(loop, options)) return;
        await this.detectSingleFaceWithLandmarks(options);


      }

      // Analyze face position, size, and alignment
      if (this.lastBox && this.lastLandmarks) {
        const [faceInside, sizeOK] = await this.handleFaceAlignment(loop);

        if (sizeOK && faceInside) {
          this.insideOvalFrames++;
          this.showMessage('dashedCircleAlignMessage', '');

          if (this.insideOvalFrames >= this.requiredFrames) {
            this.showMessage('statusMessage', '✅ Perfect! Stay still inside the dashed circle.');
            this.isFaceDetected = true;
             await this.checkDifferentFace()
            if (this.recordingFlag === 0) {
              this.startRecording_FaceReference();
              this.logService.log('info', "🎥 Starting recording...");
              this.recordingFlag = 1;
              try {
                // Start the first recording segment
                this._startSegmentRecording(); // clean only and only segment handling
              } catch (err) {
                // Handle errors that might occur starting the recording and inform user
                this.logService.log('error', `❌ Error starting segment recording: ${err}`);
                this.showMessage('statusMessage', '⚠️ Unable to start recording. Please try again.');
              }
            }
          }
        } else {
          this.insideOvalFrames = 0;
          this.isFaceDetected = false;
          if (this.isRecording && !this.isVerifyingHeadTurn) {
            this._restartCurrentSegmentDueToFaceLoss();
          }
          // User guidance based on alignment
          if (!sizeOK && !faceInside) {
            this.showMessage('dashedCircleAlignMessage', '🧭 Make sure your full face is inside the dashed circle and adjust distance.');
          } else if (!faceInside) {
            this.showMessage('dashedCircleAlignMessage', '🧭 Your entire face must be inside the dashed circle.');
          } else {
            this.showMessage('dashedCircleAlignMessage', '');
          }
        }
      } else {
        this.handleNoFaceDetected(loop);
      }


      // Schedule the next frame detection
      this.scheduleNext(loop);
    };

    // Start the detection loop
    this.scheduleNext(loop);
  }

  private validateCameraAndVideo(loop: () => void): boolean {/* Checks if camera and video element are available before continuing detection.
   * @returns `true` if valid, otherwise stops the loop.
   */
    if (!this.isCameraOn || !this.videoElement) {
      this.logService.log('info', 'Camera off or video element missing; stopping detection loop.');
      return false;
    }
    return true;
  }

  private validateOval(loop: () => void): boolean {/*Checks if the oval guide is initialized.
   * If not ready, schedules the next detection frame.
   */
 
    if (!this.oval) {
      this.logService.log('info', 'Oval guide not initialized yet; scheduling next frame.');
      this.scheduleNext(loop);
      return false;
    }
    return true;
  }

  private async handleBrightnessChecks(loop: () => void): Promise<boolean> {/* Performs checks on brightness, blank video, bright spots, and blurriness.
      * Displays messages and restarts segment if necessary.
      * @returns `true` if any condition interrupts detection.
      */

    const brightness = this.getFrameBrightness();
    this.logService.log('info', `[BrightnessCheck] Frame brightness: ${brightness}`, 'brightness');

    this.drawFaceGuideOverlay(brightness);

    if (this.isVideoBlank()) {
      if (this.isRecording ) {
            this._restartCurrentSegmentDueToFaceLoss();
          }
      this.logService.log('warn', '[BrightnessCheck] Camera feed appears blank.', 'cameraError');
      return this.showAndLogMessage(
        'cameraErrorMessage',
        '⚠️ Camera feed appears blank. Check your camera or refresh the page.',
        'warn',
        loop
      );
    }

    const mat = this.getCurrentFrameAsMat();
    let showWarning = false;

    if (mat) {
      const result = this.detectBrightSpot(mat);
      this.logService.log('info', `[BrightnessCheck] Bright spot detection result: ${result}`, 'brightness');
      mat.delete();

      if (result === 'spot detected') {
        showWarning = true;
      }
    } else {
      this.logService.log('warn', '[BrightnessCheck] Failed to get current frame as Mat.', 'cameraError');
    }

    if (showWarning) {
      if (this.isRecording && !this.isVerifyingHeadTurn) {
            this._restartCurrentSegmentDueToFaceLoss();
          }
      this.logService.log('warn', '[BrightnessCheck] Bright spot detected in the oval.', 'brightnessWarning');
      return this.showAndLogMessage(
        'brightnessMessage',
        '⚠️ Bright spot detected in the oval. Please adjust lighting or avoid reflections.',
        'warn',
        loop
      );
    }

    if (brightness < 60) {
      if (this.isRecording && !this.isVerifyingHeadTurn) {
            this._restartCurrentSegmentDueToFaceLoss();
          }
      this.logService.log('warn', '[BrightnessCheck] Too dark environment detected.', 'brightnessWarning');
      return this.showAndLogMessage(
        'brightnessMessage',
        '🌑 Too dark — please move to a brighter place.',
        'warn',
        loop
      );
    } else if (brightness > 180) {
      if (this.isRecording && !this.isVerifyingHeadTurn) {
            this._restartCurrentSegmentDueToFaceLoss();
          }
      this.logService.log('warn', '[BrightnessCheck] Too bright environment detected.', 'brightnessWarning');
      return this.showAndLogMessage(
        'brightnessMessage',
        '☀️ Too bright — reduce lighting.',
        'warn',
        loop
      );
    } else {
      this.logService.log('info', '[BrightnessCheck] Brightness is within acceptable range.', 'brightness');
      this.showMessage('brightnessMessage', '');
    }

    this.showMessage('cameraErrorMessage', '');

    if (this.isVideoBlurred()) {
      if (this.isRecording && !this.isVerifyingHeadTurn) {
            this._restartCurrentSegmentDueToFaceLoss();
          }
      this.logService.log('warn', '[BrightnessCheck] Video is blurry detected.', 'blurWarning');
      return this.showAndLogMessage(
        'dashedCircleAlignMessage',
        '🔍 Video is blurry. Clean your camera lens or adjust focus.',
        'warn',
        loop
      );
    }

    this.logService.log('info', '[BrightnessCheck] No issues detected in current frame.', 'status');
    return false;
  }

  private async checkMultipleFaces(loop: () => void, options: any): Promise<boolean> {    /*Detects all faces and ensures only one is within the oval guide.
     * Warns user if multiple faces are detected */
    
      const allFaces = await faceapi.detectAllFaces(this.videoElement, options);
      const { cx, cy, rOuter } = this.oval;
      const biggerRadius = rOuter * 1.2;

      const facesInsideCircle = allFaces.filter(face => {
        const centerX = face.box.x + face.box.width / 2;
        const centerY = face.box.y + face.box.height / 2;
        const dx = centerX - cx;
        const dy = centerY - cy;
        return Math.sqrt(dx * dx + dy * dy) <= biggerRadius;
      }).length;

      if (facesInsideCircle > 1) {
        if (this.isRecording && !this.isVerifyingHeadTurn) {
            this._restartCurrentSegmentDueToFaceLoss();
          }
        return this.showAndLogMessage('verificationMessage', '❌ Multiple faces detected inside the guide. Please ensure only one face is visible.', 'warn', loop);
      } else {
        this.showMessage('verificationMessage', '');
      }

      return false;
  }


  private async checkDifferentFace(): Promise<boolean> {/* Detects whether the current face differs from the reference face for a sustained period.
 * Returns:
 *   - `true` if different face detected (3+ consecutive checks above threshold)
 *   - `false` otherwise.
 */
    if (!this.referenceFaceDescriptor) {
      this.logService.log('info', '[FaceCheck] No reference descriptor; skipping check.');
      return false; // can't decide without baseline
    }

    try {
      const detection = await faceapi
        .detectSingleFace(this.videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection && detection.descriptor) {
        const distance = faceapi.euclideanDistance(this.referenceFaceDescriptor, detection.descriptor);
        this.logService.log('info', `[FaceCheck] distance=${distance.toFixed(3)}, counter=${this.faceMismatchCounter}`);

        if (distance > 0.6) {
          this.faceMismatchCounter++;
          this.logService.log('warn', `[FaceCheck] Mismatch counter incremented: ${this.faceMismatchCounter}`);
          this.showMessage('verificationMessage', '❌ Different face detected for several seconds! Restarting from scratch...',true, 5000);
          if (this.faceMismatchCounter >= this.faceMismatchThreshold) {
            this.logService.log('error', `[FaceCheck] ❌ Different face detected consistently for ${this.faceMismatchCounter} seconds`);
            this.faceMismatchCounter = 0; // reset counter for next cycle
            return true; // 🚨 confirmed different face
          }
        } else {
          if (this.faceMismatchCounter > 0) {
            this.logService.log('info', `[FaceCheck] Face match restored, counter reset.`);
          }
          this.faceMismatchCounter = 0; // reset if face matches
        }
      } else {
        this.logService.log('warn', `[FaceCheck] ⚠️ No face detected (null detection)`);
        this.faceMismatchCounter = 0; // treat as temporary loss, not mismatch
      }
    } catch (err) {
      this.logService.log('error', `[FaceCheck] ⚠️ Error during face detection: ${err}`);
      this.faceMismatchCounter = 0;
    }

    return false; // default safe
  }  
  private async detectSingleFaceWithLandmarks(options: any): Promise<void> { /* Detects a single face and extracts its landmarks and bounding box.
   */
    const res = await faceapi.detectSingleFace(this.videoElement, options).withFaceLandmarks();
    this.lastLandmarks = res?.landmarks ?? null;
    this.lastBox = res?.detection?.box ?? null;
  }
  
  private async handleFaceAlignment(loop: () => void): Promise<[boolean, boolean]> {/* Validates face alignment inside oval, size constraints, and triggers recording.
   */
    const box = this.lastBox!;
    const landmarks = this.lastLandmarks!;
    const fillPct = (box.height / this.oval.h) * 100;

    this.fillBuffer.push(fillPct);
    if (this.fillBuffer.length > this.smoothingWindow) this.fillBuffer.shift();

    const smoothedFill = this.fillBuffer.reduce((a, b) => a + b, 0) / this.fillBuffer.length;
    const lowerBound = 55, upperBound = 80;

    let sizeOK = false;

    if (smoothedFill < lowerBound) {
      this.showMessage('distanceMessage', '📏 Please move closer to the camera.');
    } else if (smoothedFill > upperBound) {
      this.showMessage('distanceMessage', '📏 Please move slightly farther away from the camera.');
    } else {
      sizeOK = true;
      this.showMessage('distanceMessage', '');
    }

    const faceInside = this.areLandmarksFullyInsideOval(landmarks);

    this.showMessage('ovalAlignMessage', faceInside ? "✅ Yay! Your face is perfectly inside the oval! 🎉" : '');

    return [faceInside, sizeOK];
  }

  private handleNoFaceDetected(loop: () => void): void {  /* Handles the case when no face is detected.
   */
    this.isFaceDetected = false;
    this.insideOvalFrames = 0;

    if (this.isRecording && !this.isVerifyingHeadTurn) {
      this._restartCurrentSegmentDueToFaceLoss();
    }

    // this.logService.log('info', 'No face detected in the current frame.');
  }
 
  private areLandmarksFullyInsideOval(landmarks: faceapi.FaceLandmarks68): boolean { /* Checks whether all facial landmarks lie within the oval guide boundary with tolerance.
   * @param landmarks The face landmarks to validate.
   * @returns True if all landmarks are inside the oval; otherwise false.
   */
    const { cx, cy, rOuter } = this.oval;
    const detectionRadius = rOuter * 1.2;

    return landmarks.positions.every(point => {
      const dx = point.x - cx;
      const dy = point.y - cy;
      return Math.sqrt(dx * dx + dy * dy) <= detectionRadius;
    });
  }

 private getFrameBrightness(): number {
    if (!this.brightnessCtx) return 0;

    const w = this.brightnessCanvas.width;
    const h = this.brightnessCanvas.height;

    // Draw current video frame onto canvas
    this.brightnessCtx.drawImage(this.videoElement, 0, 0, w, h);

    // Get pixel data from the canvas
    const frame = this.brightnessCtx.getImageData(0, 0, w, h).data;

    let totalLuminance = 0;
    const numPixels = frame.length / 4;

    for (let i = 0; i < frame.length; i += 4) {
      const r = frame[i];
      const g = frame[i + 1];
      const b = frame[i + 2];

      // Calculate luminance using Rec. 709 formula
      totalLuminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // Return average luminance (brightness) of the frame
    return totalLuminance / numPixels;
  }


  /* --------------------------------------------------
   * 🔹 Recording Lifecycle
   * -------------------------------------------------- */
  
  async startRecording_FaceReference() {
      /**
   * Starts a new recording session.
   * 
   * In simple terms:
   * - Resets all recording-related states and flags to prepare for a fresh recording.
   * - Checks if a face is currently detected; if not, asks user to align face properly.
   * - Attempts to capture a reference face descriptor for identity verification.
   * - Handles errors gracefully and logs useful info or warnings.
   * - Starts the first recording segment if everything is okay.
   */
    // Reset previously completed recording segments and face verification data
    this.completedSegments = [];
    this.headTurnBlob = null;
    this.headTurnVerified = false;
    this.headTurnAttemptStatus = '';
    this.showHeadTurnPrompt = false;
    this.referenceFaceDescriptor = null; // 🔄 Reset reference face for new session

    // Ensure a face is detected before starting recording; if not, notify user and log info
    if (!this.isFaceDetected) {
      this.showMessage('statusMessage', '🙋 Please align your face inside the circle and adjust distance before starting.');
      this.logService.log('info', 'Attempted to start recording but no face detected.');
      return;
    }

    try {
      // Try to detect a single face and capture its descriptor for reference
      const detection = await faceapi
        .detectSingleFace(this.videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      // If descriptor successfully captured, store it and log success
      if (detection && detection.descriptor) {
        this.referenceFaceDescriptor = detection.descriptor;
        this.logService.log('info', "✅ Reference face captured");
        this.frameCount++;
        console.log('Capturing frame', this.frameCount);

      } else {
        // If face detection failed or was unclear, warn user but continue recording
        this.logService.log('warn', "⚠️ Face not detected clearly; continuing without reference descriptor");
        this.showMessage('statusMessage', '⚠️ Face not detected clearly. Please adjust position.');
      }
    } catch (err) {
      // Handle any errors thrown by FaceAPI and notify user
      this.logService.log('error', `❌ FaceAPI error while capturing reference face: ${err}`);
      this.showMessage('statusMessage', '⚠️ Error detecting face, continuing with recording.');
    }

    // Initialize current segment number for segmented recording
    this.currentSegment = 1;


  }

  async _startSegmentRecording(resumeSecondsRecorded = 0) {
    try {
      console.log('_startSegmentRecording called ---', {
        resumeSecondsRecorded,
        currentSegment: this.currentSegment,
        isRecording: this.isRecording,
        segmentSecondsRecorded: this.segmentSecondsRecorded,
      });

      if (!this.stream) {
        this.showMessage('statusMessage', '⚠️ Camera not initialized.');
        this.logService.log('error', 'Camera stream not initialized when trying to start segment recording.');
        console.error('Camera stream not initialized. Aborting segment recording.');
        return;
      }

      if (!this.currentSegment || this.currentSegment <= 0) {
        this.currentSegment = 1;
        this.logService.log('warn', 'currentSegment was 0 or invalid, reset to 1.');
      }

      let options: MediaRecorderOptions | undefined;

      if (resumeSecondsRecorded === 0) {
        // Reset recorded chunks for current segment only if starting fresh
        this.recordedChunksPerSegment[this.currentSegment] = [];

        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          options = { mimeType: 'video/webm;codecs=vp9' };
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          options = { mimeType: 'video/webm' };
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          options = { mimeType: 'video/mp4', videoBitsPerSecond: 100000 };
        } else {
          this.logService.log('info', 'No supported MIME type found for MediaRecorder on this browser.');
          this.showMessage('statusMessage', '⚠️ MediaRecorder MIME type not supported.');
          return;
        }
      } else {
        // For resuming, use the same options
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          options = { mimeType: 'video/webm;codecs=vp9' };
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          options = { mimeType: 'video/webm' };
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          options = { mimeType: 'video/mp4', videoBitsPerSecond: 100000 };
        }
      }

      if (resumeSecondsRecorded === 0 && !this.isRecording) {
        // Starting fresh recording
        this.logService.log('info', 'Starting fresh new segment recording.');

        if (this.currentSegment === 1 && (this.segmentSecondsRecorded === undefined || this.segmentSecondsRecorded === null)) {
          this.completedSegments = [];
          this.verificationDoneForSegment = {};
          this.verificationSuccessForSegment = {};
          this.headTurnAttemptsPerSegment = {};
          this.headVerificationCountPerSegment = {};
          this.partialSegmentBlobsPerSegment = {}; // Initialize partial blobs storage
        }

        this.segmentSecondsRecorded = 0;
        this.extraSecondsRecorded = 0;
        this.isSegmentValid = true;
        this.isRecording = true;
        this.headTurnAttempts = 0;
        this.currentSessionStartTime = 0; // Track when this session started

        this.verificationDoneForSegment[this.currentSegment] = false;
        this.headTurnAttemptsPerSegment[this.currentSegment] = 0;
        this.headVerificationCountPerSegment[this.currentSegment] = 0;

        this.logService.log(
          'info',
          'Segment state initialized: ' +
            JSON.stringify({
              currentSegment: this.currentSegment,
              segmentSecondsRecorded: this.segmentSecondsRecorded,
              extraSecondsRecorded: this.extraSecondsRecorded,
              isSegmentValid: this.isSegmentValid,
              isRecording: this.isRecording,
              headTurnAttempts: this.headTurnAttempts,
              verificationDoneForSegment: this.verificationDoneForSegment[this.currentSegment],
            })
        );
      } else {
        // For resuming, start with clean chunks for new MediaRecorder session
        this.segmentSecondsRecorded = resumeSecondsRecorded;
        this.extraSecondsRecorded = 0;
        this.currentSessionStartTime = resumeSecondsRecorded; // Track when this session started

        // CRITICAL FIX: Always start with empty chunks for new MediaRecorder session
        this.recordedChunksPerSegment[this.currentSegment] = [];

        this.logService.log(
          'info',
          `Resuming segment recording from ${resumeSecondsRecorded}s with clean chunk array.`
        );
      }

      this.headSegmentSecondsRecorded = 0;

      // Create new MediaRecorder instance
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.isRecording = true;

      const segmentTarget = this.segmentDurations[this.currentSegment - 1];
      this.timeRemaining = segmentTarget - this.segmentSecondsRecorded;

      if (this.timeRemaining <= 0) {
        this.logService.log('info', 'Segment duration already met or exceeded, calling _onSegmentComplete.');
        await this._onSegmentComplete();
        return;
      }

      this.showMessage('recordingMessage', `🎥 Recording segment ${this.currentSegment}... (${this.timeRemaining}s left)`);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          if (this.isFaceDetected) {
            if (!this.recordedChunksPerSegment[this.currentSegment]) {
              this.recordedChunksPerSegment[this.currentSegment] = [];
            }
            this.recordedChunksPerSegment[this.currentSegment].push(e.data);
          }
        }
      };

      this.mediaRecorder.onstop = async () => {
        const chunkCount = this.recordedChunksPerSegment[this.currentSegment]?.length || 0;
        const segmentTarget = this.segmentDurations[this.currentSegment - 1];
        const hasEnoughTime = this.segmentSecondsRecorded >= segmentTarget;
        const hasValidChunks = chunkCount > 0;

        if (this._stoppingForRestart) {
          const sessionDuration = this.segmentSecondsRecorded - this.currentSessionStartTime;
          if (hasValidChunks && sessionDuration > 0) {
            const chunks = this.recordedChunksPerSegment[this.currentSegment];
            const blob = new Blob(chunks, { type: options?.mimeType ?? 'video/webm' });
            if (!this.partialSegmentBlobsPerSegment[this.currentSegment]) {
              this.partialSegmentBlobsPerSegment[this.currentSegment] = [];
            }
            this.partialSegmentBlobsPerSegment[this.currentSegment].push({
              blob,
              startTime: this.currentSessionStartTime,
              endTime: this.segmentSecondsRecorded,
              duration: sessionDuration
            });
          }
          this._stoppingForRestart = false;
          return;
        }

        if (this.isFaceDetected && this.isSegmentValid && hasEnoughTime && hasValidChunks) {
          const chunks = this.recordedChunksPerSegment[this.currentSegment];
          const blob = new Blob(chunks, { type: options?.mimeType ?? 'video/webm' });
          this.completedSegments.push(blob);
          this.logService.log('info', `Segment ${this.currentSegment} COMPLETED and saved.`);
        } else {
          this.logService.log('warn', `Segment ${this.currentSegment} incomplete; retrying.`);
          setTimeout(() => this._startSegmentRecording(this.segmentSecondsRecorded), 600);
          return;
        }

        if (this.shouldVerifyAfterSegment(this.currentSegment)) {
          await this._performVerificationForCurrentSegment();
          return;
        }

        await this._onSegmentComplete();
      };

      clearInterval(this.timerInterval);
      this.timerInterval = setInterval(async () => {
        if (!this.isRecording) {
          clearInterval(this.timerInterval);
          return;
        }

        if (!this.isFaceDetected) {
          if (this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.pause();
            this.showMessage('recordingMessage', `⏸️ Paused because face not detected`);
          }
          return;
        }

        if (this.mediaRecorder?.state === 'paused') {
          this.mediaRecorder.resume();
          this.showMessage('recordingMessage', `▶️ Resumed recording`);
        }

        if (this.mediaRecorder?.state === 'recording') {
          if (this.segmentSecondsRecorded < segmentTarget) {
            this.segmentSecondsRecorded++;
            this.timeRemaining = segmentTarget - this.segmentSecondsRecorded;
            if (await this.checkDifferentFace()) {
            this.isSegmentValid = false;
            this.showMessage('verificationMessage', '❌ Different face detected for several seconds! Restarting from scratch...');
            clearInterval(this.timerInterval);
            this._resetAll();
            this._restartCurrentSegmentDueToFaceLoss();
            if ((this.mediaRecorder?.state as RecordingState)!== 'inactive') this.mediaRecorder.stop();
            return;
          }

          } else {
            if (this.segmentSecondsRecorded !== segmentTarget && this.extraSecondsRecorded < 1) {
              this.extraSecondsRecorded++;
              return;
            }

            clearInterval(this.timerInterval);
            if ((this.mediaRecorder?.state as RecordingState) !== 'inactive') {
              this.mediaRecorder.stop();
            }
          }
        }
      }, 1000);

      this.mediaRecorder.start(1000);
    } catch (err) {
      this.showMessage('statusMessage', '⚠️ Unable to start recording segment. Please try again.');
      console.error('Failed to start recording:', err);
    }
  }

  private _resetAll() {// Reset all for full restart
    this.currentSegment = 1;
    this.segmentSecondsRecorded = 0;
    this.isRecording = false;
    this.completedSegments = [];
    this.verificationDoneForSegment = {};
    this.verificationTriggeredForSegment = {};
    this.headTurnAttemptsPerSegment = {};
    this.headTurnAttempts = 0;
    this.triggerVerification3 = false;
    this.firstVerificationDirection = null;
    this.secondVerificationDirection = null;
    this.thirdVerificationDirection = null;
    this.verificationTimeInSegment = 0;
  }

  private async _onSegmentComplete() { // Called when a segment + its verification are fully done
    this.showMessage('recordingMessage', `✅ Segment ${this.currentSegment} complete.`);

    if (this.currentSegment < this.totalSegments) {
      this.currentSegment++;
      this.verificationTimeInSegment = 0;
      // reset so next segment gets a new random verification point
      setTimeout(() => this._startSegmentRecording(0), 600);
    } else {
      // final segment done
      if (this.triggerVerification3 && !this.verificationDoneForSegment[3]) {
        // if verification3 is required
        await this._performVerificationForCurrentSegment();
      } else {
        this.isRecording = false;
        this.showMessage('recordingMessage', '✅ All segments & verifications complete. Thank you!');

        this.downloadLogs();
        setTimeout(() => this.downloadAllBlobs(), 3000);
        this.showSuccessScreen = true;
      }
    }
  }

  private _restartCurrentSegmentDueToFaceLoss() {/** * Restart the current recording segment if face is lost or quality issues occur.
 * Implements a cooldown to prevent rapid consecutive restarts. 
 * */
    this.logService.log('info', 'Attempting to restart current segment due to face loss.');

    if (this._restartCooldown) {
      this.logService.log('warn', 'Restart called but cooldown active. Ignoring.');
      return;
    }

    this._restartCooldown = true;
    this.logService.log('info', 'Restart cooldown activated.');

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this._stoppingForRestart = true;
      this.showMessage('verificationMessage', "⚠️ Recording reset due to face loss. Continuing from current progress...");
      this.logService.log('warn', 'Recording reset due to face loss or quality issues.');

      clearInterval(this.timerInterval);
      this.logService.log('info', 'Timer interval cleared.');

      try {
        this.logService.log('info', `Stopping mediaRecorder. Current state: ${this.mediaRecorder.state}`);
        this.mediaRecorder.stop();
        this.logService.log('info', 'MediaRecorder.stop() called successfully.');
      } catch (stopErr) {
        this.logService.log('error', `Error stopping mediaRecorder during restart: ${stopErr}`);
      }
    } else {
      this.logService.log('info', 'MediaRecorder not recording or undefined, skipping stop.');
    }

    setTimeout(() => {
    this._restartCooldown = false;
    this.logService.log('info', 'Restart cooldown reset.');

    const segmentSeconds = this.segmentSecondsRecorded ?? 0;

    let resumeTime;

    if (
      segmentSeconds > 1 &&
      this._lastAdjustedSegmentSecondsRecorded !== segmentSeconds
    ) {
      // Subtract 1 only if segmentSeconds changed since last adjustment
      resumeTime = segmentSeconds - 1;
      this._lastAdjustedSegmentSecondsRecorded = resumeTime;
      this.logService.log('info', `Adjusted segmentSecondsRecorded by -1 for segment ${this.currentSegment}`);
    } else {
      // Otherwise, use the segmentSeconds as is (or 0)
      resumeTime = segmentSeconds;
    }

    this.logService.log('info', `Resuming recording from ${resumeTime}s for segment ${this.currentSegment}.`);

    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      this.logService.log('info', 'Starting segment recording after restart.');
      this._startSegmentRecording(resumeTime);
    } else {
      this.logService.log('warn', 'Attempted to restart recording but MediaRecorder is already recording.');
    }
  }, 1000);

  }

  private downloadAllBlobs() {// Updated download method with better partial blob handling
    this.completedSegments.forEach((blob, idx) => {
      const segmentNumber = idx + 1;
      const startSecond = 0;
      const endSecond = 6;
      const attempts = this.headTurnAttemptsPerSegment[segmentNumber] || 0;

      let filename = `segment_${segmentNumber}_${startSecond}-${endSecond}`;
      filename += `.webm`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Download partial blobs with proper time ranges
    Object.keys(this.partialSegmentBlobsPerSegment || {}).forEach(segmentNum => {
      const partials = this.partialSegmentBlobsPerSegment[parseInt(segmentNum)];
      partials.forEach((partial: any, partialIdx) => {
        let filename;
        
        if (partial && typeof partial === 'object' && partial.startTime !== undefined && partial.endTime !== undefined) {
          // New format with time tracking
          const startSec = Math.floor(partial.startTime);
          const endSec = Math.floor(partial.endTime);
          filename = `segment_${segmentNum}_${startSec}-${endSec}_(${partialIdx + 1}).webm`;
        } else {
          // Fallback for old format or if partial is just a Blob
          filename = `segment_${segmentNum}_partial_${partialIdx + 1}.webm`;
        }
        
        const blob = (partial && partial.blob) ? partial.blob : partial; // Handle both old and new formats
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        this.logService.log('info', `Downloaded: ${filename}`);
      });
    });

    if (this.headTurnBlob) {
      const url2 = URL.createObjectURL(this.headTurnBlob);
      const a2 = document.createElement('a');
      a2.href = url2;
      a2.download = `head_turn.webm`;
      a2.click();
      URL.revokeObjectURL(url2);
    }

    this.statusMessage = 'Downloads complete ✅';
    this.resetAll();
    console.log("➡️ Emitting stepComplete(7)");
    this.stepComplete.emit(7);
  }
  
  private uploadAllBlobs() {
    if (!this.userId) {
      console.error('No User found!');
      return;
    }

    const uploadUrl = `${environment.apiBaseUrl}/UploadVideoSegment`;


    const uploadBlob = (blob: Blob, index: number) => {
      const formData = new FormData();
      formData.append('userId', this.userId.toString());
      formData.append('index', index.toString());
      formData.append('file', blob, `segment_${index}.webm`);

      return this.http.post(uploadUrl, formData).toPromise();
    };

    // Upload each segment sequentially or parallel
    const uploadPromises = this.completedSegments.map((blob, idx) => {
      return uploadBlob(blob, idx + 1);
    });

    // Upload headTurnBlob with index 0 if exists
    if (this.headTurnBlob) {
      uploadPromises.push(uploadBlob(this.headTurnBlob, 0));
    }

    Promise.all(uploadPromises)
      .then(() => {
        this.statusMessage = 'Uploads complete ✅';
        this.resetAll();
        console.log("➡️ Emitting stepComplete(7)");
        this.stepComplete.emit(7);
      })
      .catch((error) => {
        console.error('Upload failed:', error);
        alert('Upload failed, please try again.');
      });
  }

  resetAll() {
    this.isRecording = false;
    this.timeRemaining = 0;
    this.currentSegment = 0;
    this.completedSegments = [];
    this.headTurnBlob = null;
    this.headTurnVerified = false;
    this.showHeadTurnPrompt = false;
    this.headTurnAttemptStatus = '';
    this.insideOvalFrames = 0;
    this.blinkClosed = false;
    this.blinkCount = 0;
    this.minEAR = 1; this.maxEAR = 0;
    this.minEAR = +Infinity;
    this.maxEAR = -Infinity;
    this.stepComplete.emit(1);


  }



/* --------------------------------------------------
* 🔹 Verification Methods
* -------------------------------------------------- */


  private async _performVerificationForCurrentSegment() {
    this.showHeadTurnPrompt = true;

    let verificationDirection: 'up' | 'down' | 'left' | 'right';
    if (this.currentSegment === 1) {
      verificationDirection = this.getRandomDirection([]);
      this.firstVerificationDirection = verificationDirection;
    } else if (this.currentSegment === 2) {
      verificationDirection = this.getRandomDirection([this.firstVerificationDirection!]);
      this.secondVerificationDirection = verificationDirection;
    } else {
      verificationDirection = this.getRandomDirection([this.firstVerificationDirection!, this.secondVerificationDirection!]);
      this.thirdVerificationDirection = verificationDirection;
    }

    this.direction = verificationDirection;
    this.showMessage(
      'headTurnAttemptStatus',
      `Please ${verificationDirection === 'left'
        ? 'turn your head LEFT'
        : verificationDirection === 'right'
          ? 'turn your head RIGHT'
          : verificationDirection === 'up'
            ? 'tilt your head UP'
            : 'tilt your head DOWN'
      }`
    );
    this.logService.log('info', `Prompting user to ${verificationDirection}`);

    // Pause main recording before starting head verification recording
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.showMessage('recordingMessage', `⏸️ Paused segment recording for head verification.`);
    }

    // Setup and start headMediaRecorder here:
    let options: MediaRecorderOptions | undefined;
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      options = { mimeType: 'video/webm;codecs=vp9' };
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options = { mimeType: 'video/webm' };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4', videoBitsPerSecond: 100000 };
    } else {
      this.logService.log('error', 'No supported MIME type found for MediaRecorder on this browser.');
      this.showMessage('statusMessage', '⚠️ MediaRecorder MIME type not supported.');
      return;
    }

    this.headRecordedChunks = [];
    this.headSegmentSecondsRecorded = 0;

    this.headMediaRecorder = new MediaRecorder(this.stream, options);

    this.headMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.headRecordedChunks.push(e.data);
        this.headSegmentSecondsRecorded++;
      }
    };

    this.headMediaRecorder.onstop = () => {
      const chunksToKeep = Math.min(this.headRecordedChunks.length, 3);
      const selectedChunks = this.headRecordedChunks.slice(-chunksToKeep);
      const headBlob = new Blob(selectedChunks, { type: options?.mimeType ?? 'video/webm' });
      if (!this.headVerificationCountPerSegment[this.currentSegment]) {
        this.headVerificationCountPerSegment[this.currentSegment] = 0;
      }

      this.headVerificationCountPerSegment[this.currentSegment]++;
      const count = this.headVerificationCountPerSegment[this.currentSegment];

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = URL.createObjectURL(headBlob);
      a.download = `head${count}.webm`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
      }, 100);

      this.showMessage('statusMessage', `Head verification video head${count}.webm downloaded.`);

      // Reset head chunks and counter for next verification video if any
      this.headRecordedChunks = [];
      this.headSegmentSecondsRecorded = 0;

      // Resume main recording after head verification is done
      if (this.mediaRecorder && this.mediaRecorder.state === 'paused' && this.isRecording) {
        this.mediaRecorder.resume();
        this.showMessage('recordingMessage', `▶️ Resumed segment recording after head verification video.`);
      }
    };

    this.headMediaRecorder.start();

    // Now call your verification function that awaits the user's head movement
    const success = await this.startHeadMovementVerification(verificationDirection);

    // Stop the headMediaRecorder when done verification
    if (this.headMediaRecorder.state === 'recording' || this.headMediaRecorder.state === 'paused') {
      this.headMediaRecorder.stop();
    }

    this.showHeadTurnPrompt = false;

    if (success) {
      this.verificationDoneForSegment[this.currentSegment] = true;
      this.headTurnAttempts = 0;
      this.headTurnAttemptsPerSegment[this.currentSegment] = 0;
      this.showMessage('headTurnAttemptStatus', `✅ Head turn verified.`);

      // Resume rest of segment recording (only if segment not finished)
      setTimeout(() => this._startSegmentRecording(this.segmentSecondsRecorded), 600);

    } else {
      this.headTurnAttempts++;
      this.headTurnAttemptsPerSegment[this.currentSegment] = this.headTurnAttempts;
      this.showMessage('headTurnAttemptStatus', `❌ Head turn failed attempt ${this.headTurnAttempts}. Please try again.`);

      if (this.headTurnAttempts >= this.maxHeadTurnAttempts) {
        if (this.currentSegment === 1) {
          this.HeadTurnRecordingFailed = true;
          this.showMessage('headTurnAttemptStatus', `❌ Verification 1 failed ${this.headTurnAttempts} times. Restarting all segments.`);
          this._resetAll();
          setTimeout(() => this._startSegmentRecording(0), 1000);
        } else if (this.currentSegment === 2) {
          this.HeadTurnRecordingFailed = true;
          this.showMessage('headTurnAttemptStatus', `❌ Verification 2 failed. Will trigger verification 3 after final video.`);
          this.triggerVerification3 = true;
          setTimeout(() => this._startSegmentRecording(this.segmentDurations[this.currentSegment - 1]), 600);
        } else {
          this.HeadTurnRecordingFailed = true;
          this.showMessage('headTurnAttemptStatus', `❌ Verification 3 failed. Restarting all.`);
          this._resetAll();
          setTimeout(() => this._startSegmentRecording(0), 1000);
        }
      } else {
        // Retry verification
        setTimeout(() => this._performVerificationForCurrentSegment(), 1500);
      }
    }
  }

  async startHeadMovementVerification(direction: 'left' | 'right' | 'up' | 'down'): Promise<boolean> {/*Starts the head movement verification process in the specified direction.
   * Returns a Promise that resolves to true if verification succeeds, false otherwise.
   */
    try {
      // Check if the camera is active before starting verification
      if (!this.isCameraOn) {
        this.cameraErrorMessage = 'Camera not started';
        this.logService.log('error', '[HeadVerification] Camera not active');
        return false;  // Cannot verify without camera
      }

      // Initialize verification state variables
      this.headTurnDirection = direction;       // Store the requested head turn direction
      this.headTurnAttemptStatus = '';           // Clear previous attempt status
      this.isVerifyingHeadTurn = true;           // Flag indicating verification is in progress
      this.headTurnBlob = null;                   // Clear any previous recorded video blob
      this.VerificationStatus = false;            // Reset verification status to false

      // Show a user-friendly message to prompt head movement in the desired direction
      this.verificationMessage = `Recording head movement (${direction.toUpperCase()}) — please move now...`;
      this.showMessage("", this.verificationMessage);

      // Wait briefly before starting verification (short delay to prepare)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Perform the core head movement verification logic (returns true/false)
      const success = await this.runVerification(direction);

      // Wait an additional 3 seconds before finishing (could be to stabilize UI or user feedback)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Mark verification as complete
      this.isVerifyingHeadTurn = false;

      // Return whether the head movement verification was successful or not
      return success;

    } catch (outerErr) {
      // Handle unexpected errors gracefully and log them
      this.logService.log('error', `[HeadVerification] Unexpected error: ${outerErr}`);
      this.verificationMessage = '❌ Unexpected error during verification.';
      this.isVerifyingHeadTurn = false;
      return false;
    }
  }

  private runVerification(direction: 'left' | 'right' | 'up' | 'down'): Promise<boolean> { /* Core verification function that monitors head movement in a given direction.
   * Records video during the movement and resolves with true if movement is verified, false otherwise.
   */
 
    return new Promise((resolve, reject) => {
      try {
        // Array to collect recorded video chunks
        const tempChunks: Blob[] = [];
        let recorder: MediaRecorder | null = null;
        let success = false;        // Flag to track if verification succeeded
        let isRecording = false;    // Flag to track if recording is currently active

        // Attempt to create MediaRecorder for video capture
        try {
          recorder = new MediaRecorder(this.stream, { mimeType: 'video/webm;codecs=vp9' });
        } catch (err) {
          this.logService.log('error', `[HeadVerification] Failed to create MediaRecorder: ${err}`);
          resolve(false);  // Fail immediately if recorder creation fails
          return;
        }

        // Event triggered when new data chunk is available
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) tempChunks.push(e.data);
        };

        // Event triggered when recording stops
        recorder.onstop = () => {
          // Combine all chunks into one video Blob
          const blob = new Blob(tempChunks, { type: 'video/webm' });
          this.headTurnBlob = blob;  // Store recorded blob for later use (e.g., download)

          if (success) {
            this.verificationMessage = '✅ Head movement verified — downloading...';
            this.logService.log('info', '[HeadVerification] 🎥 Recording complete. Starting download.');
            this.showMessage("headTurnAttemptStatus", this.verificationMessage);
            // Optionally trigger download or show success UI here
            resolve(true);
          } else {
            this.logService.log('info', '[HeadVerification] 🎥 Recording complete. No verification.');
            resolve(false);
          }
        };

        // Define thresholds for yaw (left/right rotation) and pitch (up/down rotation)
        const yawThreshold = 0.35;
        const pitchThreshold = 0.38;
        const upThreshold = 0.12;

        const nearYawThreshold = yawThreshold * 0.2;   // Smaller threshold to start recording
        const nearPitchThresholdDown = 0.270;
        const nearPitchThresholdUp = 0.200;

        this.logService.log('info', `[HeadVerification] Started. Direction: ${direction}, YawThreshold: ${yawThreshold}, PitchThreshold: ${pitchThreshold}`);
        this.showMessage("headTurnAttemptStatus", `[HeadVerification] Started. Direction: ${direction}, YawThreshold: ${yawThreshold}, PitchThreshold: ${pitchThreshold}`);

        // Start UI blinking effect to guide user (custom method)
        this.startBlinking(direction);

        // Clear overlay canvas for fresh drawing
        try {
          const ctx = this.overlayCanvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        } catch (err) {
          this.logService.log('warn', `[HeadVerification] Could not clear overlay canvas: ${err}`);
        }

        // Sampling interval to check head movement roughly every 150ms
        const sampler = setInterval(() => {
          try {
            // Check if face landmarks and bounding box data are available
            if (!this.lastLandmarks || !this.lastBox || !this.oval) return;

            // Verify if face center is inside the predefined oval bounds
            const box = this.lastBox;
            const faceCenterX = box.x + box.width / 2;
            const faceCenterY = box.y + box.height / 2;
            const dx = faceCenterX - this.oval.cx;
            const dy = faceCenterY - this.oval.cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // If user moves outside the oval while recording, stop recording immediately
            if (dist > this.oval.rOuter) {
              if (isRecording && recorder && recorder.state !== 'inactive') {
                this.logService.log('info', '[HeadVerification] User moved outside oval, stopping recording.');
                recorder.stop();
                isRecording = false;
              }
              return;
            }

            let isVerified = false;

            // Calculate yaw value based on landmarks
            const yawFromLandmarks = (lm: faceapi.FaceLandmarks68) => {
              const leftEye = lm.getLeftEye();
              const rightEye = lm.getRightEye();
              const nose = lm.getNose()[3];
              const leftEyeOuter = leftEye[0];
              const rightEyeOuter = rightEye[3];
              const eyeDist = Math.max(1, rightEyeOuter.x - leftEyeOuter.x);
              const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
              return (nose.x - eyeMidX) / eyeDist;
            };

            // Calculate pitch value based on landmarks
            const pitchFromLandmarks = (lm: faceapi.FaceLandmarks68) => {
              const leftEye = lm.getLeftEye();
              const rightEye = lm.getRightEye();
              const nose = lm.getNose();
              const jaw = lm.getJawOutline();

              const leftEyeCenter = {
                x: (leftEye[0].x + leftEye[3].x) / 2,
                y: (leftEye[1].y + leftEye[5].y) / 2
              };
              const rightEyeCenter = {
                x: (rightEye[0].x + rightEye[3].x) / 2,
                y: (rightEye[1].y + rightEye[5].y) / 2
              };

              const eyeMidY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
              const noseTip = nose[3];
              const chinPoint = jaw[8];

              const faceHeight = Math.max(1, chinPoint.y - eyeMidY);
              const noseRelativeY = (noseTip.y - eyeMidY) / faceHeight;
              return noseRelativeY;
            };

            // Process horizontal (left/right) head movements
            if (direction === 'left' || direction === 'right') {
              const yaw = yawFromLandmarks(this.lastLandmarks);
              this.lastYaw = yaw;
              this.logService.log('info', `[HeadVerification] Yaw: ${yaw.toFixed(3)}`);

              // Start recording once user’s yaw reaches the near threshold
              if (!isRecording && ((direction === 'left' && yaw < -nearYawThreshold) || (direction === 'right' && yaw > nearYawThreshold))) {
                recorder?.start();
                isRecording = true;
                this.showMessage("", `Started recording for Head Turn ${direction}`);
                this.logService.log('info', '[HeadVerification] Started recording (near yaw threshold).');
              }

              // Stop recording if user moves back inside the near threshold bounds
              if (isRecording && !((direction === 'left' && yaw < -nearYawThreshold) || (direction === 'right' && yaw > nearYawThreshold))) {
                recorder?.stop();
                isRecording = false;
                this.logService.log('info', '[HeadVerification] Stopped recording (yaw out of near threshold).');
              }

              // Confirm verification if yaw crosses the main threshold
              if ((direction === 'left' && yaw < -yawThreshold) || (direction === 'right' && yaw > yawThreshold)) {
                isVerified = true;
              }
            }
            // Process vertical (up/down) head movements
            else if (direction === 'up' || direction === 'down') {
              const pitch = pitchFromLandmarks(this.lastLandmarks);
              this.lastPitch = pitch;
              this.logService.log('info', `[HeadVerification] Pitch: ${pitch.toFixed(3)}`);

              if (direction === 'down') {
                // Start recording once pitch reaches near down threshold
                if (!isRecording && pitch > nearPitchThresholdDown) {
                  this.showMessage("", `Started recording for Head ${direction}`);
                  recorder?.start();
                  isRecording = true;
                  this.logService.log('info', '[HeadVerification] Started recording (near down pitch threshold).');
                }
                // Stop recording if pitch drops below near down threshold
                if (isRecording && pitch <= nearPitchThresholdDown) {
                  recorder?.stop();
                  isRecording = false;
                  this.logService.log('info', '[HeadVerification] Stopped recording (down pitch below near threshold).');
                }

                // Confirm verification if pitch crosses main down threshold
                if (pitch > pitchThreshold) {
                  isVerified = true;
                  success = true;
                  this.showMessage("verificationMessage", "✅ DOWN movement detected.");
                  this.logService.log('info', `[HeadVerification] ✅ DOWN detected. Pitch: ${pitch.toFixed(3)} > ${pitchThreshold}`);
                } else {
                  this.showMessage("verificationMessage", "⬇️ Not enough DOWN movement.");
                }
              }

              if (direction === 'up') {
                // Start recording once pitch reaches near up threshold
                if (!isRecording && pitch < nearPitchThresholdUp) {
                  recorder?.start();
                  isRecording = true;
                  this.logService.log('info', '[HeadVerification] Started recording (near up pitch threshold).');
                }
                // Stop recording if pitch goes above near up threshold
                if (isRecording && pitch >= nearPitchThresholdUp) {
                  recorder?.stop();
                  isRecording = false;
                  this.logService.log('info', '[HeadVerification] Stopped recording (up pitch above near threshold).');
                }

                // Confirm verification if pitch is below the up threshold
                if (pitch < upThreshold) {
                  isVerified = true;
                  success = true;
                  this.showMessage("verificationMessage", "✅ UP movement detected.");
                  this.logService.log('info', `[HeadVerification] ✅ UP detected. Pitch: ${pitch.toFixed(3)} < ${upThreshold}`);
                } else {
                  this.showMessage("verificationMessage", "⬆️ Not enough UP movement.");
                }
              }
            }

            // Optionally draw face landmarks on overlay canvas here:
            // this.drawFaceLandmarks(this.lastLandmarks, this.overlayCanvas);

            if (isVerified) {
              success = true;
              this.VerificationStatus = true;
              this.stopBlinking();           // Stop blinking UI effect
              clearInterval(sampler);        // Stop periodic sampling
              this.HeadTurnRecordingDone = true;
              if (recorder && recorder.state !== 'inactive') recorder.stop();

              this.verificationMessage = `✅ VERIFIED direction (${direction.toUpperCase()})!`;
              this.showMessage("statusMessage", this.verificationMessage);

              // Add glow effect to video element for feedback
              const videoEl = document.querySelector('video');
              if (videoEl) {
                videoEl.classList.add('glow-green');
                setTimeout(() => videoEl.classList.remove('glow-green'), 3000);
              }

              // The final resolve(true) happens inside recorder.onstop after blob is ready
            }

          } catch (err) {
            this.logService.log('error', `[HeadVerification] Sampler error: ${err}`);
          }
        }, 150);

        // Timeout fallback: stop verification if it takes longer than 30 seconds
        setTimeout(() => {
          try {
            clearInterval(sampler);
            this.stopBlinking();

            if (!success) {
              if (isRecording && recorder && recorder.state !== 'inactive') recorder.stop();
              this.VerificationStatus = false;
              this.HeadTurnRecordingFailed = true;
              this.verificationMessage = `❌ Head movement (${direction.toUpperCase()}) not detected in time. Please try again.`;
              this.logService.log('error', `[HeadVerification] ❌ TIMEOUT. Direction: ${direction} not verified in time.`);
              resolve(false);
            }
          } catch (err) {
            this.logService.log('error', `[HeadVerification] Timeout cleanup failed: ${err}`);
            resolve(false);
          }
        }, 30000);

      } catch (err) {
        this.logService.log('error', `[HeadVerification] Unexpected error in verification: ${err}`);
        resolve(false);
      }
    });
  }

  getRandomDirection(exclude: Array<'up' | 'down' | 'left' | 'right'>): 'up' | 'down' | 'left' | 'right' {  /**
   * Starts recording a video segment, optionally resuming from a previously recorded duration.
   * 
   * In simple terms:
   * - Checks if the camera stream is ready, otherwise logs error and stops.
   * - Initializes or resumes recording segment state and resets verification flags.
   * - Selects the best supported video format for recording.
   * - Handles recording lifecycle: capturing data chunks, stopping, saving segments.
   * - Prompts user to do head-turn verification at a random time within the segment.
   * - Manages retries and failures for head-turn verification.
   * - Moves to the next segment or finishes recording when all segments are done.
   */
  // Add this as a class property to track frame number per segment
  // Add these class-level properties: // initialise appropriately

  // Simulate your head movement verification method - replace with actual implementation


  // Utility to pick a random head turn direction excluding some

    const types: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];
    const filtered = types.filter(t => !exclude.includes(t));
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  startBlinking(direction: 'left' | 'right' | 'up' | 'down') {// Starts a blinking animation effect on the face guide overlay, toggling visibility every 500ms
  // The blinking direction ('left', 'right', 'up', 'down') is stored to indicate current target movement
    this.blinkingDirection = direction; // Save direction for reference
    this.blinkVisible = true;            // Initially show the blink overlay

    if (this.blinkIntervalId) clearInterval(this.blinkIntervalId); // Clear existing blink interval if any

    this.blinkIntervalId = setInterval(() => {
      this.blinkVisible = !this.blinkVisible;  // Toggle visibility on/off to create blink effect

      // Redraw face guide overlay with current brightness (default 100 if not set)
      this.drawFaceGuideOverlay(this.currentBrightness || 100);
    }, 500); // Repeat every 500 milliseconds (twice per second)
  }

  stopBlinking() {// Stops the blinking animation and resets related state, then redraws the overlay fully visible
  
    if (this.blinkIntervalId) {
      clearInterval(this.blinkIntervalId); // Clear blinking interval timer
      this.blinkIntervalId = null;         // Reset interval ID
    }
    this.blinkingDirection = null;  // Clear stoared blinking direction
    this.blinkVisible = false;      // Hide blink overlay

    // Redraw face guide overlay with current brightness (default 100 if not set)
    this.drawFaceGuideOverlay(this.currentBrightness || 100);
  }

  shouldVerifyAfterSegment(segmentNumber: number): boolean {
      if (segmentNumber === 1 || segmentNumber === 2) return true;
      if (segmentNumber === 3) {
        return this.verificationSuccessForSegment?.[2] === false;
      }
      return false;
  }
  
  drawFaceLandmarks(landmarks: faceapi.FaceLandmarks68, canvas: HTMLCanvasElement) {/* Draws facial landmarks on the given canvas for visual feedback.
   * This helps users align their face correctly during verification.
   */
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // NOTE: We don't clear the canvas here to keep the landmarks visible.
    // Consider clearing it outside this function if needed (e.g., at the start of a new segment).

    // Set drawing styles for the landmarks
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';     // Green dots
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';   // Green outlines
    ctx.lineWidth = 2;

    // Draw a green dot at every landmark point (e.g., around eyes, mouth, etc.)
    landmarks.positions.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Helper function to draw connected lines between sets of facial points
    const drawPath = (points: faceapi.Point[], closePath = false) => {
      ctx.beginPath();
      points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      if (closePath) ctx.closePath();  // Close shape if needed (e.g., around eyes or mouth)
      ctx.stroke();
    };

    // Draw outlines for different facial regions
    drawPath(landmarks.getJawOutline());         // Jawline
    drawPath(landmarks.getLeftEyeBrow());        // Left eyebrow
    drawPath(landmarks.getRightEyeBrow());       // Right eyebrow
    drawPath(landmarks.getNose());               // Nose bridge & tip
    drawPath(landmarks.getLeftEye(), true);      // Left eye (closed shape)
    drawPath(landmarks.getRightEye(), true);     // Right eye (closed shape)
    drawPath(landmarks.getMouth(), true);        // Mouth (closed shape)

    // Calculate nose tip and eye centers for head pose reference
    const nose = landmarks.getNose()[3];  // Nose tip
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    // Approximate center of each eye
    const leftEyeCenter = {
      x: (leftEye[0].x + leftEye[3].x) / 2,
      y: (leftEye[1].y + leftEye[5].y) / 2
    };
    const rightEyeCenter = {
      x: (rightEye[0].x + rightEye[3].x) / 2,
      y: (rightEye[1].y + rightEye[5].y) / 2
    };

    // Midpoint between both eyes — helpful for drawing reference line
    const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
    const eyeMidY = (leftEyeCenter.y + rightEyeCenter.y) / 2;

    // Draw a yellow dot at the midpoint between the eyes
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(eyeMidX, eyeMidY, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Draw a red line from the eye midpoint to the nose tip to indicate head direction
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(eyeMidX, eyeMidY);
    ctx.lineTo(nose.x, nose.y);
    ctx.stroke();

    // Display pitch, yaw, and head turn status as text on canvas
    if (this.lastYaw !== undefined && this.lastPitch !== undefined) {
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      ctx.fillText(`Yaw: ${this.lastYaw.toFixed(3)}`, 10, 20);          // Left/right turn
      ctx.fillText(`Pitch: ${this.lastPitch.toFixed(3)}`, 10, 40);      // Up/down tilt
      ctx.fillText(`Direction: ${this.headTurnDirection || 'none'}`, 10, 60);
      ctx.fillText(`Status: ${this.VerificationStatus ? 'VERIFIED' : 'detecting...'}`, 10, 80);
    }
  }

  async startSmileVerification() {
    if (!this.isCameraOn) return;

    this.verificationMessage = '😊 Please smile! Recording now...';
    const tempChunks: Blob[] = [];
    const recorder = new MediaRecorder(this.stream);
    let success = false;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) tempChunks.push(e.data);
    };

    const smileThreshold = 0.6;

    const sampler = setInterval(async () => {
      try {
        const result = await faceapi
          .detectSingleFace(this.videoElement, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();

        if (result && result.expressions.happy > smileThreshold) {
          success = true;
          clearInterval(sampler);
          try { recorder.stop(); } catch { }
        }
      } catch (err) {
        console.error("Smile detection error:", err);
      }
    }, 200);

    recorder.start();

    setTimeout(() => {
      clearInterval(sampler);
      if (recorder.state !== 'inactive') recorder.stop();
    }, 5000);

    await new Promise(res => recorder.onstop = res as any);

    if (tempChunks.length > 0) {
      this.headTurnBlob = new Blob(tempChunks, { type: 'video/webm' });
    }

    if (success) {
      this.headTurnVerified = true;
      this.verificationMessage = '✅ Smile detected successfully!';
      this.uploadAllBlobs();
      setTimeout(() => this.downloadAllBlobs(), 7000);

    } else {
      this.verificationMessage = '❌ Smile not detected. Please try again.';
      setTimeout(() => this.startSmileVerification(), 5000);
    }
  }

  private generateSegmentDurations() {//Store video durations to sum exactly 10 seconds
  //  segmentDurations = [3, 2, 5]; // total 10 seconds
    // Random first segment: 2 or 3
    const firstVal = Math.floor(Math.random() * 2) + 2; // 2 or 3

    // Random second segment: 2 to 4
    const secondVal = Math.floor(Math.random() * 3) + 2; // 2,3,4

    // Last segment = total - (first + second)
    const lastVal = Math.max(this.totalDuration - (firstVal + secondVal), 1);

    this.segmentDurations = [firstVal, secondVal, lastVal];
  }

  private drawFaceGuideOverlay(brightness: number) {
    const ctx = this.overlayCanvas.getContext('2d')!;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    const outerRadius = Math.min(w, h) * 0.35;      // Inner transparent circle radius
    const biggerRadius = outerRadius * 1.2;         // Outer circle radius

    // Step 1: Background fill logic based on brightness
    if (brightness < 60) {

      // Too dark: fill outside bigger circle with white
      ctx.fillStyle = 'white';
    } else if (brightness > 180) {
      // Too bright: fill outside bigger circle with black
      ctx.fillStyle = 'black';
    } else {
      // Normal brightness: fill outside bigger circle with dimmed black
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    }
    ctx.fillRect(0, 0, w, h);

    // Step 2: Punch out a big transparent circle with biggerRadius (show camera inside this)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, biggerRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Reset compositing to normal
    ctx.globalCompositeOperation = 'source-over';

    // Step 3: Determine outer circle stroke color based on recording and timer
    let outerStrokeColor = '#ffffff'; // default white
    if (this.isRecording && (this.timeRemaining < 6 && this.timeRemaining > 0 || this.isFaceDetected)) {
      outerStrokeColor = '#16a34a'; // green while recording and timer counting down
    }

    // Step 4: Draw outlines for biggerRadius and outerRadius circles
    // Outer bigger circle (solid)
    ctx.beginPath();
    ctx.arc(cx, cy, biggerRadius, 0, 2 * Math.PI);
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = outerStrokeColor;  // use dynamic stroke color here!
    ctx.stroke();

    // Inner alignment circle (white dashed)
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, 2 * Math.PI);
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // --- BLINKING ARC ---
    if (this.blinkingDirection && this.blinkVisible) {
      ctx.beginPath();
      ctx.lineWidth = 12;

      // Neon blue color that pops on black backgrounds
      ctx.strokeStyle = 'rgba(0, 191, 255, 1)';

      // Glow effect
      ctx.shadowColor = 'rgba(0, 191, 255, 0.7)';
      ctx.shadowBlur = 20;

      const radius = biggerRadius + 10;

      let startAngle: number;
      let endAngle: number;

      switch (this.blinkingDirection) {
        case 'left':
          startAngle = -Math.PI * 0.5;  // 90 deg (top)
          endAngle = Math.PI * 0.5;     // 270 deg (bottom)
          break;
        case 'right':
          startAngle = Math.PI * 0.5;   // 270 deg (bottom)
          endAngle = Math.PI * 1.5;     // 90 deg (top)
          break;
        case 'down':
          startAngle = 0;               // 0 deg (right)
          endAngle = Math.PI;           // 180 deg (left)
          break;
        case 'up':
          startAngle = Math.PI;         // 180 deg (left)
          endAngle = Math.PI * 2;       // 360 deg / 0 deg (right)
          break;
        default:
          // fallback to full circle or no blink
          startAngle = 0;
          endAngle = 0;
          break;
      }

      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();

      // Reset shadowBlur for next draw calls
      ctx.shadowBlur = 0;
    }


    // Instruction text (moved slightly higher for visibility)
    ctx.font = '18px Arial';
    ctx.fillStyle = '#ffffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Align your face within the white circles', cx, cy + biggerRadius + 20);

    // Step 5: Recording progress arc (green arc on inner alignment circle)
    if (this.isRecording) {
      this.recordedFrameCount++;
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + 2 * Math.PI * this.ovalProgress;
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Save oval info for detection alignment
    this.oval = {
      cx,
      cy,
      rOuter: outerRadius,
      rInner: outerRadius * 0.7,
      w: outerRadius * 2,
      h: outerRadius * 2,
    };
  }


/* --------------------------------------------------
* 🔹 OpenCV Helpers
* -------------------------------------------------- */

  detectBrightSpot(frame: any): string {
    try {
      // ==== Adjustable Parameters (tweak these for tuning detection) ====
      const BRIGHTNESS_THRESHOLD = 230;  // Pixel brightness threshold (0-255), lower = more sensitive to bright spots
      const MIN_CONTOUR_AREA = 500;      // Minimum contour area to consider (in pixels)
      const MAX_CONTOUR_AREA = 70000;    // Maximum contour area to consider
      const MIN_RADIUS = 20;             // Minimum radius of detected bright spot (in pixels)
      const MAX_RADIUS = 180;            // Maximum radius of detected bright spot
      const CIRCULARITY_MIN = 0.3;       // Minimum circularity (0-1+), 1 = perfect circle
      const CIRCULARITY_MAX = 1.3;       // Maximum circularity threshold

      // ====================================================================

      let gray = new cv.Mat();
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

      const height = gray.rows, width = gray.cols;
      const centerX = Math.floor(width / 2), centerY = Math.floor(height / 2);

      // Use rInner radius from oval or fallback
      const mainRadius = this.oval?.rInner || Math.max(Math.min(centerX, centerY) - 10, 1);

      // Threshold bright areas based on adjustable brightness threshold
      let thresh = new cv.Mat();
      cv.threshold(gray, thresh, BRIGHTNESS_THRESHOLD, 255, cv.THRESH_BINARY);

      // Create circular mask centered on frame
      let mask = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1);
      cv.circle(mask, new cv.Point(centerX, centerY), mainRadius, new cv.Scalar(255, 255, 255), -1);

      let masked = new cv.Mat();
      cv.bitwise_and(thresh, mask, masked);

      // Find contours in masked bright areas
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(masked, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let spotFound = false;
      for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);

        // Filter contours by adjustable area thresholds
        if (area < MIN_CONTOUR_AREA || area > MAX_CONTOUR_AREA) continue;

        let circle = cv.minEnclosingCircle(contour);
        let radius = circle.radius;
        let cx = circle.center.x;
        let cy = circle.center.y;

        // Filter by distance from center
        let dist = Math.sqrt((cx - centerX) ** 2 + (cy - centerY) ** 2);
        if (dist > mainRadius) continue;

        // Filter contours by adjustable radius range
        if (radius < MIN_RADIUS || radius > MAX_RADIUS) continue;

        let perimeter = cv.arcLength(contour, true);
        if (perimeter === 0) continue;

        let circularity = 4 * Math.PI * (area / (perimeter * perimeter));

        // Filter by adjustable circularity range
        if (circularity >= CIRCULARITY_MIN && circularity <= CIRCULARITY_MAX) {
          console.log(`[BrightnessCheck] Contour ${i} matched: area=${area}, radius=${radius}, circularity=${circularity.toFixed(2)}`);
          spotFound = true;
          break;
        }
      }

      // Clean up mats to avoid memory leaks
      gray.delete(); thresh.delete(); mask.delete(); masked.delete();
      contours.delete(); hierarchy.delete();

      return spotFound ? 'spot detected' : 'no spot detected';
    } catch (err) {
      console.error('Bright spot detection error:', err);
      return 'error';
    }
  }

  getCurrentFrameAsMat(): any {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        return cv.imread(canvas);
      } catch (err) {
        console.error('Error reading frame for OpenCV:', err);
        return null;
      }
  }

  /* --------------------------------------------------
   * 🔹 Utility + Misc
   * -------------------------------------------------- */

 
  private scheduleNext(fn: FrameRequestCallback | (() => void)): void { /* Schedule the next animation frame callback and save the RAF ID.
   * @param fn The callback to execute on the next animation frame.
   */
    this.rafId = requestAnimationFrame(fn as FrameRequestCallback);
  }


}
