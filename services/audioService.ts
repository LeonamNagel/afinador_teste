// Constants for note calculation
const A4_FREQUENCY = 440.0;
const NOTE_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

/**
 * Converts a frequency in Hz to the closest musical note.
 * @param frequency - The frequency in Hz.
 * @returns An object containing the note name, octave, target frequency, and cents deviation.
 */
export function frequencyToNoteDetails(frequency: number) {
  if (frequency === 0) {
    return null;
  }

  const noteNumber = 12 * (Math.log(frequency / A4_FREQUENCY) / Math.log(2));
  const roundedNoteNumber = Math.round(noteNumber) + 57; // MIDI note number for A4 is 69. A0 is 21. We use 57 for A4 mapping.
  
  const noteIndex = roundedNoteNumber % 12;
  const octave = Math.floor(roundedNoteNumber / 12);
  const noteName = NOTE_NAMES[noteIndex];

  const targetFrequency = getFrequencyForNote(noteName, octave);
  const cents = 1200 * Math.log2(frequency / targetFrequency);

  return { noteName, octave, frequency: targetFrequency, cents };
}


/**
 * Calculates the frequency of a given musical note.
 * @param noteName - The name of the note (e.g., "A", "C#").
 * @param octave - The octave number.
 * @returns The frequency of the note in Hz.
 */
function getFrequencyForNote(noteName: string, octave: number): number {
    const noteIndex = NOTE_NAMES.indexOf(noteName);
    const noteNumber = noteIndex + (octave * 12);
    // Adjusting from A4 (which is note 57 in our 0-indexed array from A0)
    return A4_FREQUENCY * Math.pow(2, (noteNumber - 57) / 12);
}


/**
 * Implements an autocorrelation algorithm with octave error correction to find the fundamental frequency.
 * @param buffer - The time-domain audio data from an AnalyserNode.
 * @param sampleRate - The sample rate of the audio context.
 * @returns The fundamental frequency in Hz, or 0 if not found.
 */
export function findFundamentalFrequency(buffer: Float32Array, sampleRate: number): number {
  const size = buffer.length;
  const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / size);

  // If the signal is too weak, consider it silence.
  if (rms < 0.01) {
    return 0;
  }

  // Define the search range for the target voice (80Hz to 200Hz)
  const maxFreq = 200;
  const minFreq = 80;
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.ceil(sampleRate / minFreq);
  const searchSize = maxPeriod;

  // --- Autocorrelation ---
  const correlations = new Array(searchSize).fill(0);
  for (let lag = minPeriod; lag < searchSize; lag++) {
    for (let i = 0; i < size - lag; i++) {
      correlations[lag] += buffer[i] * buffer[i + lag];
    }
  }

  // --- Peak Picking with Octave Error Correction (inspired by MPM) ---

  // Find the end of the initial downward slope from the peak at lag 0.
  let firstDip = 0;
  while (firstDip < searchSize - 1 && correlations[firstDip] > correlations[firstDip + 1]) {
    firstDip++;
  }
  const searchStart = Math.max(minPeriod, firstDip);

  // Find the absolute maximum peak value in the searchable range.
  let maxVal = -1;
  for (let i = searchStart; i < searchSize; i++) {
    if (correlations[i] > maxVal) {
      maxVal = correlations[i];
    }
  }

  if (maxVal <= 0) {
    return 0;
  }

  // Set a threshold relative to the absolute maximum peak for clarity.
  const clarityThreshold = maxVal * 0.9;

  // Find the *first* peak (local maximum) that is above the clarity threshold.
  // This prioritizes longer periods (lower frequencies), correcting octave errors.
  let period = -1;
  for (let i = searchStart; i < searchSize - 1; i++) {
    if (correlations[i] > clarityThreshold && correlations[i] > correlations[i - 1] && correlations[i] > correlations[i + 1]) {
      period = i;
      break; // Found the first significant peak, so we are done.
    }
  }
  
  // Fallback if no peak is found with the new logic
  if (period === -1) {
    let maxPos = -1;
    let fallbackMaxVal = -1;
     for (let i = searchStart; i < searchSize; i++) {
        if (correlations[i] > fallbackMaxVal) {
            fallbackMaxVal = correlations[i];
            maxPos = i;
        }
    }
    period = maxPos;
  }
  
  if (period <= 0) {
      return 0;
  }

  // --- Parabolic Interpolation for better peak accuracy ---
  if (period > 0 && period < searchSize - 1) {
    const T0 = period;
    const y_minus_1 = correlations[T0 - 1] || 0;
    const y_0 = correlations[T0];
    const y_plus_1 = correlations[T0 + 1] || 0;
    
    const pNumerator = y_plus_1 - y_minus_1;
    const pDenominator = 2 * (2 * y_0 - y_plus_1 - y_minus_1);

    if (pDenominator !== 0) {
        const p = pNumerator / pDenominator;
        const corrected_T = T0 + p;
        if (corrected_T <= 0) return 0;
        return sampleRate / corrected_T;
    }
  }

  return sampleRate / period;
}