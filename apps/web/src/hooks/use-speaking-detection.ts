import { useEffect, useRef, useState } from "react";
import { getAudioContext } from "@/lib/audio-context";

interface AudioTrackInput {
  peerId: string;
  track: MediaStreamTrack;
}

interface AnalyserEntry {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
}

const THRESHOLD = 30;
const DEBOUNCE_MS = 300;

/**
 * Monitors audio tracks via Web Audio API AnalyserNode and reports
 * which peers are currently speaking.
 *
 * Accepts both remote audio tracks and the local mic track.
 * Returns a Set of peerIds currently speaking.
 */
export function useSpeakingDetection(
  audioTracks: Array<AudioTrackInput>,
): Set<string> {
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(
    () => new Set(),
  );

  const nodesRef = useRef<Map<string, AnalyserEntry>>(new Map());
  const lastSpokeAtRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const ctx = getAudioContext();
    const currentNodes = nodesRef.current;
    const incomingKeys = new Set<string>();

    // Build set of incoming track keys and add new ones
    for (const { peerId, track } of audioTracks) {
      const key = `${peerId}:${track.id}`;
      incomingKeys.add(key);

      if (!currentNodes.has(key)) {
        try {
          const stream = new MediaStream([track]);
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          // Connect source -> analyser only (dead-end, no destination)
          source.connect(analyser);
          currentNodes.set(key, { source, analyser });
        } catch (e) {
          console.warn("Failed to create analyser for track:", key, e);
        }
      }
    }

    // Remove tracks that are no longer present
    for (const [key, entry] of currentNodes) {
      if (!incomingKeys.has(key)) {
        entry.source.disconnect();
        currentNodes.delete(key);
        // Clean up lastSpokeAt for this key
        lastSpokeAtRef.current.delete(key);
      }
    }

    // Start polling loop
    const poll = () => {
      const now = Date.now();
      const speaking = new Set<string>();
      const lastSpoke = lastSpokeAtRef.current;

      for (const { peerId, track } of audioTracks) {
        const key = `${peerId}:${track.id}`;
        const entry = currentNodes.get(key);
        if (!entry) continue;

        const dataArray = new Uint8Array(entry.analyser.frequencyBinCount);
        entry.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        if (average > THRESHOLD) {
          lastSpoke.set(key, now);
          speaking.add(peerId);
        } else {
          const lastTime = lastSpoke.get(key) ?? 0;
          if (now - lastTime < DEBOUNCE_MS) {
            // Within debounce window, still considered speaking
            speaking.add(peerId);
          }
        }
      }

      // Only update state if the set actually changed
      setSpeakingPeers((prev) => {
        if (prev.size !== speaking.size) return speaking;
        for (const id of speaking) {
          if (!prev.has(id)) return speaking;
        }
        return prev;
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
  }, [audioTracks]);

  // Clean up all nodes on unmount
  useEffect(() => {
    return () => {
      for (const entry of nodesRef.current.values()) {
        entry.source.disconnect();
      }
      nodesRef.current.clear();
      lastSpokeAtRef.current.clear();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return speakingPeers;
}
