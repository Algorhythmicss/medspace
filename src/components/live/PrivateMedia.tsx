"use client";
import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/live-clinic";
export default function PrivateMedia({
  media,
  planToken,
  patient = false,
}: {
  media: MediaItem;
  planToken?: string;
  patient?: boolean;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null),
    objectUrl = useRef("");
  useEffect(
    () => () => {
      controller.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [media.id],
  );
  async function load() {
    setLoading(true);
    setError("");
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const headers: Record<string, string> = planToken
          ? { Authorization: `Bearer ${planToken}` }
          : {},
        response = await fetch(
          `/api/live/media/${media.id}?view=${patient ? "patient" : "doctor"}`,
          { headers, cache: "no-store", signal: current.signal },
        );
      if (!response.ok)
        throw new Error(
          "This file is unavailable. Refresh your care link or contact the clinic.",
        );
      const blob = await response.blob();
      if (current.signal.aborted) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const value = URL.createObjectURL(blob);
      objectUrl.current = value;
      setUrl(value);
    } catch (problem) {
      if (!current.signal.aborted)
        setError(
          problem instanceof Error
            ? problem.message
            : "Could not load this file.",
        );
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }
  return (
    <div>
      {!url ? (
        <button
          type="button"
          className="t-cap inline-flex min-h-11 items-center font-semibold text-peri"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading
            ? "Loading…"
            : media.kind === "doctor_audio"
              ? "Listen to message"
              : "View progress photo"}
        </button>
      ) : media.kind === "doctor_audio" ? (
        <audio
          controls
          preload="metadata"
          src={url}
          className="mt-2 w-full"
          aria-label="Doctor voice message"
        />
      ) : (
        // A private authenticated blob must not go through the public image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Patient-reported progress photo"
          className="mt-2 max-h-80 w-full rounded-xl object-contain"
        />
      )}
      {error ? (
        <p role="alert" className="t-cap mt-1 text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
