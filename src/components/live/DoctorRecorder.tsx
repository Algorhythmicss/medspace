"use client";
import { useEffect, useRef, useState } from "react";
export default function DoctorRecorder({
  patientId,
  patientName,
  onShared,
}: {
  patientId: string;
  patientName: string;
  onShared?: () => Promise<void>;
}) {
  const [status, setStatus] = useState<
      "idle" | "requesting" | "recording" | "ready" | "sharing"
    >("idle"),
    [elapsed, setElapsed] = useState(0),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    started = useRef(0),
    blob = useRef<Blob | null>(null),
    duration = useRef(0),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    key = useRef(""),
    requestGeneration = useRef(0),
    alive = useRef(true),
    url = useRef("");
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (timer.current) clearInterval(timer.current);
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // This ref is an operation counter, not a DOM node; invalidate late permission results.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestGeneration.current++;
      stop();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (
        status === "recording" ||
        status === "ready" ||
        status === "sharing"
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);
  async function start() {
    if (
      status === "requesting" ||
      status === "recording" ||
      status === "sharing"
    )
      return;
    setError("");
    setReceipt("");
    setStatus("requesting");
    const attempt = ++requestGeneration.current;
    let permissionTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is not available in this browser. Use a current browser with microphone access.",
        );
      const permission = navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false,
        })
        .then((source) => {
          if (!alive.current || attempt !== requestGeneration.current) {
            source.getTracks().forEach((track) => track.stop());
            throw new DOMException(
              "Microphone request cancelled",
              "AbortError",
            );
          }
          return source;
        });
      const source = await Promise.race([
        permission,
        new Promise<never>((_resolve, reject) => {
          permissionTimer = setTimeout(
            () =>
              reject(
                new Error(
                  "Microphone permission is still pending. Check your browser prompt, then try again.",
                ),
              ),
            15000,
          );
        }),
      ]);
      clearTimeout(permissionTimer);
      if (!alive.current) {
        source.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = source;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime)
        throw new Error(
          "This browser cannot create a supported audio message.",
        );
      const value = new MediaRecorder(source, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      recorder.current = value;
      chunks.current = [];
      key.current = crypto.randomUUID();
      started.current = performance.now();
      setElapsed(0);
      value.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      let interrupted = false;
      value.onerror = () => {
        interrupted = true;
        stop();
        if (alive.current) {
          setStatus("idle");
          setError(
            "Recording was interrupted. Please record the message again.",
          );
        }
      };
      value.onstop = () => {
        source.getTracks().forEach((track) => track.stop());
        if (timer.current) clearInterval(timer.current);
        if (!alive.current || interrupted) return;
        duration.current = Math.min(
          120000,
          Math.round(performance.now() - started.current),
        );
        const recorded = new Blob(chunks.current, { type: mime });
        if (recorded.size > 2 * 1024 * 1024 || duration.current < 200) {
          setStatus("idle");
          setError(
            "That message was empty or too large. Record a short new message.",
          );
          return;
        }
        blob.current = recorded;
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(recorded);
        setPreview(url.current);
        setStatus("ready");
      };
      value.start(250);
      setStatus("recording");
      timer.current = setInterval(() => {
        const seconds = Math.floor(
          (performance.now() - started.current) / 1000,
        );
        setElapsed(Math.min(seconds, 120));
        if (seconds >= 120) stop();
      }, 250);
    } catch (problem) {
      if (attempt !== requestGeneration.current) return;
      requestGeneration.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      if (!alive.current) return;
      setStatus("idle");
      setError(
        problem instanceof DOMException && problem.name === "NotAllowedError"
          ? "Microphone access was not allowed. Enable it for this doctor page and try again."
          : problem instanceof Error
            ? problem.message
            : "Could not start recording.",
      );
    } finally {
      clearTimeout(permissionTimer);
    }
  }
  function discard() {
    requestGeneration.current++;
    stop();
    blob.current = null;
    chunks.current = [];
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = "";
    setPreview("");
    setStatus("idle");
    setError("");
  }
  async function share() {
    if (!blob.current || status === "sharing") return;
    setStatus("sharing");
    setError("");
    const form = new FormData();
    form.set("patientId", patientId);
    form.set("commandId", key.current);
    form.set("durationMs", String(duration.current));
    form.set("share", "yes");
    const mime = blob.current.type.split(";")[0];
    form.set(
      "files",
      new File(
        [blob.current],
        mime === "audio/mp4"
          ? "doctor-message.m4a"
          : mime === "audio/ogg"
            ? "doctor-message.ogg"
            : "doctor-message.webm",
        { type: blob.current.type },
      ),
    );
    try {
      const response = await fetch("/api/live/audio", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ||
            "The message could not be confirmed as shared. Keep this page open and retry.",
        );
      if (!alive.current) return;
      discard();
      setReceipt(
        `Shared with ${patientName}. It is available in their private care plan.`,
      );
      await onShared?.();
    } catch (problem) {
      if (alive.current) {
        setStatus("ready");
        setError(
          problem instanceof Error
            ? problem.message
            : "Could not confirm sharing. Retry the same recording.",
        );
      }
    }
  }
  return (
    <section
      className="card p-4"
      aria-labelledby={`voice-heading-${patientId}`}
    >
      <h3 id={`voice-heading-${patientId}`} className="t-head">
        Voice message for {patientName}
      </h3>
      <p className="t-cap mt-1 text-ink3">
        Record your own explanation, preview it, then share. Up to two minutes;
        nothing is sent while recording.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "idle" || status === "requesting" ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={status === "requesting"}
            onClick={() => void start()}
          >
            {status === "requesting"
              ? "Waiting for microphone…"
              : "Record message"}
          </button>
        ) : null}
        {status === "requesting" ? (
          <button type="button" className="btn btn-secondary" onClick={discard}>
            Cancel microphone request
          </button>
        ) : null}
        {status === "recording" ? (
          <>
            <span role="status" className="t-cap font-semibold text-coral">
              Recording · {Math.floor(elapsed / 60)}:
              {String(elapsed % 60).padStart(2, "0")}
            </span>
            <button type="button" className="btn btn-secondary" onClick={stop}>
              Stop recording
            </button>
          </>
        ) : null}
      </div>
      {preview ? (
        <div className="mt-3">
          <audio
            controls
            src={preview}
            className="w-full"
            aria-label="Preview your recording"
          />
          <p className="t-micro mt-2 text-ink3">
            Unsent recording stays on this page only. Check the patient name
            before sharing.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={status === "sharing"}
              onClick={() => void share()}
            >
              {status === "sharing" ? "Sharing…" : "Share with patient"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={status === "sharing"}
              onClick={discard}
            >
              Discard recording
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="t-cap mt-3 text-coral">
          {error}
        </p>
      ) : null}
      {receipt ? (
        <p role="status" className="t-cap mt-3 text-jade">
          {receipt}
        </p>
      ) : null}
    </section>
  );
}
