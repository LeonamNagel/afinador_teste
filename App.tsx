import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { NoteDetails } from './types';
import { findFundamentalFrequency, frequencyToNoteDetails } from './services/audioService';
import { Mic, MicOff, AlertTriangle } from 'lucide-react';

// Smoothing factor for the frequency. 0 < alpha < 1.
// Corresponds to a VU meter's ~300ms response time at a 60Hz refresh rate.
const SMOOTHING_ALPHA = 0.055;
const PAUSE_THRESHOLD_MS = 500; // Time of silence to consider as a pause and reset average
const FREEZE_ON_SILENCE_MS = 5000; // How long to hold the last reading when silent

const App: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedFrequency, setDetectedFrequency] = useState(0);
  const [displayedFrequency, setDisplayedFrequency] = useState(0); // For stable display
  const [averageFrequency, setAverageFrequency] = useState(0);
  const [noteDetails, setNoteDetails] = useState<NoteDetails | null>(null);
  const [backgroundColor, setBackgroundColor] = useState('bg-gray-900');

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const smoothedFrequencyRef = useRef(0);
  const frequencyHistoryRef = useRef<{ freq: number, timestamp: number }[]>([]);
  const lastSoundTimestampRef = useRef(0);
  const resetStateTimeoutRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);


  const processAudio = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const bufferLength = analyserRef.current.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyserRef.current.getFloatTimeDomainData(buffer);

    const fundamentalFrequency = findFundamentalFrequency(buffer, audioContextRef.current.sampleRate);
    
    const isFrequencyInRange = fundamentalFrequency >= 80 && fundamentalFrequency <= 200;
    
    if (isFrequencyInRange) { // Sound in valid range detected
        // A valid sound is detected, so we cancel any pending reset.
        if (resetStateTimeoutRef.current) {
            clearTimeout(resetStateTimeoutRef.current);
            resetStateTimeoutRef.current = null;
        }

        // Apply exponential smoothing to stabilize the frequency reading
        const newSmoothedFrequency = SMOOTHING_ALPHA * fundamentalFrequency + (1 - SMOOTHING_ALPHA) * smoothedFrequencyRef.current;
        smoothedFrequencyRef.current = newSmoothedFrequency;

        setDetectedFrequency(newSmoothedFrequency);
        lastSoundTimestampRef.current = Date.now();
        frequencyHistoryRef.current.push({ freq: newSmoothedFrequency, timestamp: Date.now() });

    } else { // Silence or out-of-range frequency detected
        // If no valid sound is detected, and a reset isn't already scheduled, schedule one.
        if (!resetStateTimeoutRef.current && isListening) {
            resetStateTimeoutRef.current = window.setTimeout(() => {
                setDetectedFrequency(0);
                setDisplayedFrequency(0); // Reset big number as well
                smoothedFrequencyRef.current = 0; // Reset smoother too
                resetStateTimeoutRef.current = null;
            }, FREEZE_ON_SILENCE_MS);
        }
    }
    
    // --- 3-Second Average Calculation with Pause Detection ---
    const now = Date.now();
    
    // Filter out readings older than 3 seconds
    frequencyHistoryRef.current = frequencyHistoryRef.current.filter(
      reading => now - reading.timestamp < 3000
    );

    const timeSinceLastSound = now - lastSoundTimestampRef.current;
    
    // If it has been silent for longer than the threshold, consider it a pause and reset.
    if (timeSinceLastSound > PAUSE_THRESHOLD_MS) {
        frequencyHistoryRef.current = []; // Clear history on pause
    }

    // Calculate the average
    if (frequencyHistoryRef.current.length > 0) {
      const total = frequencyHistoryRef.current.reduce((sum, r) => sum + r.freq, 0);
      setAverageFrequency(total / frequencyHistoryRef.current.length);
    } else {
      setAverageFrequency(0);
    }
    
    animationFrameId.current = requestAnimationFrame(processAudio);
  }, [isListening]);

  // Effect for updating the stable displayed frequency every 1 second
  useEffect(() => {
    let intervalId: number | undefined;
    if (isListening) {
      intervalId = window.setInterval(() => {
        // Only update the display if there is a meaningful frequency
        if (smoothedFrequencyRef.current > 1) {
            setDisplayedFrequency(smoothedFrequencyRef.current);
        }
      }, 1000);
    }
    // Cleanup function to clear interval
    return () => clearInterval(intervalId);
  }, [isListening]);


  useEffect(() => {
    if (detectedFrequency > 0) {
      const details = frequencyToNoteDetails(detectedFrequency);
      setNoteDetails(details);
    } else {
      setNoteDetails(null);
    }

    // Update background color of the entire screen based on the detected frequency
    if (detectedFrequency >= 80 && detectedFrequency <= 160) {
      setBackgroundColor('bg-green-600');
    } else if (detectedFrequency > 160 && detectedFrequency <= 180) {
      setBackgroundColor('bg-yellow-600');
    } else if (detectedFrequency > 180) {
      setBackgroundColor('bg-red-600');
    } else {
      // Default color for the screen when idle
      setBackgroundColor('bg-gray-900');
    }
  }, [detectedFrequency]);


  const startListening = useCallback(async () => {
    setError(null);
    smoothedFrequencyRef.current = 0; // Reset smoother on start
    setDisplayedFrequency(0); // Reset stable display
    frequencyHistoryRef.current = []; // Reset history
    lastSoundTimestampRef.current = 0; // Reset pause detection
    setAverageFrequency(0);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('A API de Mídia do Navegador não é suportada neste navegador.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      
      const bandpassFilter = context.createBiquadFilter();
      bandpassFilter.type = 'bandpass';
      const centerFrequency = Math.sqrt(80 * 200);
      bandpassFilter.frequency.setValueAtTime(centerFrequency, context.currentTime);
      const bandwidth = 200 - 80;
      bandpassFilter.Q.setValueAtTime(centerFrequency / bandwidth, context.currentTime);

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;

      source.connect(bandpassFilter);
      bandpassFilter.connect(analyser);
      
      analyserRef.current = analyser;

      setIsListening(true);
      animationFrameId.current = requestAnimationFrame(processAudio);

      // --- Screen Wake Lock (Mobile Only) ---
      if (isMobile && 'wakeLock' in navigator) {
          try {
              wakeLockRef.current = await navigator.wakeLock.request('screen');
          } catch (err) {
              console.error(`Não foi possível ativar o bloqueio de tela: ${err}`);
          }
      }

    } catch (err) {
      console.error('Erro ao acessar o microfone:', err);
      if (err instanceof Error) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              setError('Permissão para usar o microfone foi negada. Por favor, habilite o acesso nas configurações do seu navegador.');
          } else {
              setError(`Erro ao iniciar o microfone: ${err.message}`);
          }
      } else {
          setError('Ocorreu um erro desconhecido ao tentar acessar o microfone.');
      }
      setIsListening(false);
    }
  }, [processAudio, isMobile]);

  const stopListening = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsListening(false);
    setDetectedFrequency(0);
    setDisplayedFrequency(0);
    setNoteDetails(null);
    smoothedFrequencyRef.current = 0;
    frequencyHistoryRef.current = [];
    lastSoundTimestampRef.current = 0;
    setAverageFrequency(0);
    if (resetStateTimeoutRef.current) {
        clearTimeout(resetStateTimeoutRef.current);
        resetStateTimeoutRef.current = null;
    }
    // --- Release Screen Wake Lock ---
    if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
    }
  }, []);
  
    // Re-acquire wake lock on visibility change (Mobile Only)
    useEffect(() => {
        const handleVisibilityChange = async () => {
             if (!isMobile || !isListening || document.visibilityState !== 'visible') {
                return;
            }
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.error(`Não foi possível reativar o bloqueio de tela: ${err}`);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isListening, isMobile]);


  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div 
        className={`
            min-h-screen w-full flex flex-col items-center justify-between p-6 sm:p-8 font-sans text-white
            transition-colors duration-300 ease-in-out
            ${backgroundColor}
        `}
    >
        {/* Top: Average Frequency */}
        <div className="flex flex-col items-center text-center select-none opacity-80">
            <div className="text-sm text-gray-200/80">Média (3s)</div>
            <div className="text-5xl font-semibold text-gray-100 tabular-nums">
                {averageFrequency > 0 ? averageFrequency.toFixed(1) : '--'}
            </div>
        </div>

        {/* Center: Main Frequency and Note */}
        <div className="flex flex-col items-center justify-center text-center select-none flex-grow">
            <div className="text-[10rem] leading-none font-bold tracking-tighter tabular-nums" style={{ textShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                {displayedFrequency > 1 ? displayedFrequency.toFixed(1) : '--'}
            </div>
            <div className="text-4xl text-gray-200/80 mt-2">
                {noteDetails ? `${noteDetails.noteName}${noteDetails.octave}` : <>&nbsp;</>}
            </div>
        </div>

        {/* Bottom: Control Button and Error */}
        <div className="w-full max-w-md flex flex-col items-center space-y-4">
            {error && (
                <div className="w-full bg-black/30 border border-red-700/50 text-red-200 px-4 py-3 rounded-xl flex items-center space-x-3">
                    <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
            )}
            <button
                onClick={handleToggleListening}
                aria-label={isListening ? 'Parar de ouvir' : 'Começar a ouvir'}
                className={`
                    w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out
                    focus:outline-none focus:ring-4 focus:ring-opacity-50 transform hover:scale-105 active:scale-95
                    shadow-2xl
                    ${isListening 
                        ? 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-400' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-400'
                    }
                `}
            >
                {isListening ? (
                    <MicOff className="w-9 h-9 sm:w-10 sm:h-10" />
                ) : (
                    <Mic className="w-9 h-9 sm:w-10 sm:h-10" />
                )}
            </button>
        </div>
    </div>
  );
};

export default App;