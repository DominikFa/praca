import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import type { EventRecord, VerifyTicketResponse } from '../types';
import { isMobileDevice } from '../utils/deviceDetection';
import './ScannerView.css';

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

export function ScannerView() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyScanRef = useRef(false);

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | ''>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [scanResult, setScanResult] = useState<VerifyTicketResponse | null>(null);

  useEffect(() => {
    if (!isMobileDevice()) {
      navigate('/events', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!isMobileDevice()) return;
    api
      .getScannerEvents()
      .then((list) => {
        setEvents(list);
        if (list.length > 0) setSelectedEventId(list[0].id);
      })
      .catch((err) => {
        setCameraError(err instanceof Error ? err.message : 'Failed to load events');
      });
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const submitTokenForVerification = async (token: string) => {
    if (!selectedEventId || busyScanRef.current) return;
    busyScanRef.current = true;
    setVerifying(true);
    try {
      const result = await api.verifyTicket({
        qrToken: token.trim(),
        eventId: Number(selectedEventId),
      });
      setScanResult(result);
    } catch (err) {
      setScanResult({
        valid: false,
        result: 'INVALID',
        message: err instanceof Error ? err.message : 'Verification failed',
      });
    } finally {
      setVerifying(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not available in this browser. Use manual token input below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError('Camera access denied. Check browser permissions or enter token manually.');
    }
  };

  useEffect(() => {
    if (!cameraActive || !selectedEventId) return;

    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
      }
    ).BarcodeDetector;

    if (!DetectorCtor) {
      setCameraError('Automatic QR scanning is not supported in this browser. Enter the token below.');
      return;
    }

    const detector = new DetectorCtor({ formats: ['qr_code'] });
    const interval = window.setInterval(async () => {
      if (!videoRef.current || busyScanRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0 && codes[0].rawValue) {
          await submitTokenForVerification(codes[0].rawValue);
        }
      } catch {
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [cameraActive, selectedEventId]);

  const handleManualVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    await submitTokenForVerification(manualToken);
    setManualToken('');
  };

  const handleCloseResultModal = () => {
    setScanResult(null);
    busyScanRef.current = false;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Scanner</h1>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          No events available to scan right now.
        </div>
      ) : (
        <div className="scanner-card">
          <div className="form-field">
            <label htmlFor="scanner-event-select">Event</label>
            <select
              id="scanner-event-select"
              className="input"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(Number(e.target.value))}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

          {cameraError && <div className="alert-error">{cameraError}</div>}

          <div className="camera-viewport">
            <video ref={videoRef} playsInline muted />
            {cameraActive && <div className="camera-reticle" />}
            {!cameraActive && (
              <span style={{ color: '#b5b1a6', fontSize: '0.88rem' }}>Camera off</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.1rem' }}>
            {!cameraActive ? (
              <button type="button" className="btn btn-primary btn-block" onClick={startCamera}>
                Start Camera
              </button>
            ) : (
              <button type="button" className="btn btn-danger btn-block" onClick={stopCamera}>
                Stop Camera
              </button>
            )}
          </div>

          <form onSubmit={handleManualVerify}>
            <div className="form-field">
              <label htmlFor="manual-qr-token">Manual Token Input</label>
              <input
                id="manual-qr-token"
                className="input"
                placeholder="Paste QR token..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-secondary btn-block"
              disabled={verifying || !manualToken.trim()}
            >
              {verifying ? 'Checking...' : 'Verify Ticket'}
            </button>
          </form>
        </div>
      )}

      <Modal
        open={Boolean(scanResult)}
        title="Scan Result"
        onClose={handleCloseResultModal}
      >
        {scanResult && (
          <>
            <div
              className={`scan-outcome-banner ${
                scanResult.valid
                  ? 'scan-outcome-banner--valid'
                  : 'scan-outcome-banner--invalid'
              }`}
            >
              <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{scanResult.result}</div>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.92rem' }}>{scanResult.message}</p>
            </div>

            {scanResult.ticket && (
              <div style={{ fontSize: '0.88rem', marginBottom: '1rem' }}>
                <div>
                  <strong>Ticket:</strong> #{scanResult.ticket.id}
                </div>
                <div>
                  <strong>Holder:</strong> {scanResult.ticket.ownerName}
                </div>
                <div>
                  <strong>Event:</strong> {scanResult.ticket.eventName}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={handleCloseResultModal}
            >
              Scan Next
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}