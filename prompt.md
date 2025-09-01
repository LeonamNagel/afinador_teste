# Prompt for Generating a Real-Time Voice Tuner Web Application

## 1. Objective

Create a single-page, real-time voice tuner web application using React, TypeScript, and Tailwind CSS. The application should be designed to help users train their voice, specifically targeting a lower vocal range (e.g., baritone). It must capture audio from the user's microphone, analyze its fundamental frequency, and provide clear, immediate visual feedback.

## 2. Core Features

- **Microphone Input:** The app must request microphone access and process the audio stream in real time.
- **Fundamental Frequency Detection:** Implement a robust algorithm to detect the fundamental frequency of the user's voice. The primary target range is **80Hz to 200Hz**. Frequencies outside this range should be ignored.
- **Real-Time Frequency Display:**
    - Display the detected frequency prominently. To avoid jitter, this main numerical display should only update its value once per second.
    - Internally, a smoothed frequency value should be calculated on every animation frame for more responsive visual feedback (like color changes).
- **Musical Note Conversion:** Convert the detected frequency into the closest musical note (e.g., "A#3") and display it.
- **3-Second Average Frequency:** Calculate and display a rolling average of the frequency over the last 3 seconds of continuous sound. This average should reset if there is a pause in sound for more than 500ms.
- **Visual Feedback:** The background color of the main tuner display must change dynamically based on the detected frequency to indicate how close the user is to the target range.
- **Controls:** A single button to toggle the microphone on and off.
- **Error Handling:** Display a user-friendly error message if microphone permission is denied or if another error occurs during setup.

## 3. UI/UX Design Specification

The design should be clean, modern, and focused, with a dark theme.

- **Layout:** A single, centered column. The entire page should have a dark gray background (`bg-gray-900`).
- **Main Tuner Component:**
    - A large, square card with heavily rounded corners (`w-72 h-72 rounded-3xl`).
    - It should have a subtle border (`border border-gray-700`) and shadow (`shadow-2xl`).
    - The background of this card is dynamic (see color palette below) and should transition smoothly (`transition-colors duration-300`).
    - **Top Section:**
        - The primary frequency display: `7xl` font size, bold, `tabular-nums` for stable width. Displays one decimal place (e.g., "110.5") when active, and "--" when idle.
        - The note display: `2xl` font size, slightly transparent text, directly below the frequency. Displays the note name and octave (e.g., "A2").
    - **Bottom Section:**
        - A row containing the control button and the average frequency display.
        - **Control Button (Left):**
            - A circular button (`w-16 h-16 rounded-full`) with a prominent hover effect (`hover:scale-105`).
            - Use `lucide-react` icons: `<Mic />` when off, `<MicOff />` when on.
            - The button's color indicates its state (see color palette).
        - **Average Frequency Display (Right):**
            - A text block showing the calculated 3-second average.
            - Display the value with one decimal place (`text-xl font-semibold`), and a label "Média (3s)" below it (`text-xs text-gray-300/80`).
- **Error Display:**
    - If an error occurs, display a banner below the main tuner component.
    - It should have a reddish background (`bg-red-900/50`), a red border (`border-red-700`), and contain an `<AlertTriangle />` icon from `lucide-react` next to the error message text.

- **Color Palette:**
    - Page Background: `bg-gray-900`
    - Text: `text-white`, with variations like `text-gray-200/80`.
    - Tuner Card Background (Dynamic):
        - Idle: `bg-gray-800/70`
        - In-Tune (80Hz - 160Hz): `bg-green-600`
        - Slightly Sharp (160Hz - 180Hz): `bg-yellow-600`
        - Sharp (> 180Hz): `bg-red-600`
    - Control Button Background:
        - Off/Idle: `bg-indigo-600`
        - On/Listening: `bg-red-600`

## 4. Technical Requirements

- **Stack:**
    - **React & ReactDOM:** v18+
    - **TypeScript**
    - **Styling:** **Tailwind CSS**, loaded via a CDN in the `index.html`. No local installation.
    - **Icons:** **lucide-react**, loaded from a CDN like `esm.sh`.
- **File Structure:** Organize the code into the following files:
    - `index.html`: Boilerplate HTML with CDN links for Tailwind and an import map for React/lucide-react.
    - `index.tsx`: React root renderer.
    - `App.tsx`: The main component containing all UI, state, and audio processing logic hooks.
    - `services/audioService.ts`: A dedicated file for pure audio processing functions.
    - `types.ts`: TypeScript type definitions (e.g., `NoteDetails`).
    - `metadata.json`: Must request `microphone` permission.
- **Audio Processing (`services/audioService.ts`):**
    - Use the **Web Audio API** (`AudioContext`, `AnalyserNode`).
    - **Filter:** Before analysis, apply a `BiquadFilterNode` with `type: 'bandpass'` to isolate the **80Hz-200Hz** frequency range.
    - **`findFundamentalFrequency(buffer, sampleRate)` function:**
        - Implement an **autocorrelation** algorithm.
        - First, calculate the RMS of the buffer. If it's below a threshold (e.g., 0.01), return 0 (silence).
        - Perform autocorrelation only within the period range corresponding to 80Hz-200Hz.
        - Implement **octave error correction**: Instead of picking the absolute highest correlation peak, find the *first* significant peak above a high threshold (e.g., 90% of the absolute max peak). This favors lower frequencies (longer periods) and prevents jumping to harmonics.
        - Use **parabolic interpolation** on the chosen peak to achieve sub-sample accuracy for a more precise frequency reading.
    - **`frequencyToNoteDetails(frequency)` function:**
        - Convert a given frequency (in Hz) to its nearest musical note.
        - Use A4 = 440Hz as the reference pitch.
        - The function should return an object containing the note name (e.g., "C#"), octave, the precise frequency of that note, and the deviation in cents.
- **Application Logic (`App.tsx`):**
    - **State Management:** Use React hooks (`useState`, `useRef`, `useCallback`, `useEffect`).
    - **Frequency Smoothing:** Apply an exponential moving average to the raw frequency detected from the audio service to reduce jitter. A smoothing factor `alpha` of around `0.055` is appropriate. All color changes should be based on this smoothed value.
    - **Stable Display:** Use a `useEffect` with a `setInterval` of 1000ms to update the main `displayedFrequency` state, providing a stable number for the user to read.
    - **Averaging Logic:**
        - Maintain an array of `{ freq, timestamp }` objects in a `useRef`.
        - On each audio frame, add the new smoothed frequency if sound is detected.
        - Filter out any readings older than 3 seconds.
        - Implement pause detection: track the `lastSoundTimestamp`. If the time since the last sound exceeds 500ms, clear the history array.
        - Calculate and update the `averageFrequency` state.
    - **Lifecycle:** Properly create and tear down the `AudioContext` and media stream when the user starts and stops listening to prevent resource leaks. The `AudioContext` should be closed on stop.