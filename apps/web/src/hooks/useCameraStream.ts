import { useRef, useCallback } from "react";

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraErrorRef = useRef<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) return;
      cameraErrorRef.current = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }
    } catch (err) {
      console.error("Failed to start camera:", err);
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera access in your browser settings, or switch to Demo Mode."
          : "Camera access is unavailable on this device.";
      cameraErrorRef.current = message;
      throw new Error(message);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return null;
    }

    // Set canvas dimensions to match video source
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to base64 JPEG, quality 0.8
    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    // Return with the prefix format required by the App
    return base64;
  }, []);

  const getCameraError = useCallback(() => cameraErrorRef.current, []);
  const clearCameraError = useCallback(() => {
    cameraErrorRef.current = null;
  }, []);

  return {
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    captureFrame,
    getCameraError,
    clearCameraError,
  };
}
