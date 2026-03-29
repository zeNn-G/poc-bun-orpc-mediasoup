import { useEffect, useRef, useState } from "react";
import { getAudioContext } from "@/lib/audio-context";

const THRESHOLD = 30;
const DEBOUNCE_MS = 300;

/**
 * Monitors a single local audio track via Web Audio API AnalyserNode
 * and reports whether the local user is currently speaking.
 *
 * Returns a Set containing the local peerId if speaking, empty otherwise.
 * Server-side audio level detection handles remote peers.
 */
export function useLocalSpeakingDetection(
  localAudioTrack: MediaStreamTrack | null,
  peerId: string,
): Set<string> {
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(
    () => new Set(),
  );

  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastSpokeAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Clean up previous nodes
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
      analyserRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!localAudioTrack || !localAudioTrack.enabled) {
      setSpeakingPeers(new Set());
      return;
    }

    const ctx = getAudioContext();
    try {
      const stream = new MediaStream([localAudioTrack]);
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
    } catch (e) {
      console.warn("Failed to create analyser for local track:", e);
      return;
    }

    const poll = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;

      const now = Date.now();
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      let isSpeaking = false;
      if (average > THRESHOLD) {
        lastSpokeAtRef.current = now;
        isSpeaking = true;
      } else if (now - lastSpokeAtRef.current < DEBOUNCE_MS) {
        isSpeaking = true;
      }

      setSpeakingPeers((prev) => {
        const wasSpeaking = prev.has(peerId);
        if (isSpeaking === wasSpeaking) return prev;
        return isSpeaking ? new Set([peerId]) : new Set();
      });

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [localAudioTrack, peerId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
        analyserRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return speakingPeers;
}
