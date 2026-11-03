import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.MEDSPACE_PLAYWRIGHT_MODULE ||
    "/Users/mac/Medspace/tmp/assessment-tools/node_modules/playwright/index.mjs"
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  const recording = await page.evaluate(async () => {
    const context = new AudioContext(),
      destination = context.createMediaStreamDestination(),
      oscillator = context.createOscillator(),
      gain = context.createGain();
    gain.gain.value = 0.025;
    oscillator.frequency.value = 440;
    oscillator.connect(gain);
    gain.connect(destination);
    await context.resume();
    const chunks = [];
    const recorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 64000,
    });
    const completed = new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: recorder.mimeType }));
    });
    oscillator.start();
    recorder.start(250);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    recorder.stop();
    oscillator.stop();
    const blob = await completed;
    destination.stream.getTracks().forEach((track) => track.stop());
    await context.close();
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await mkdir(resolve("scripts/fixtures"), { recursive: true });
  await writeFile(
    resolve("scripts/fixtures/synthetic-doctor-message.webm"),
    Buffer.from(recording),
  );
  console.log(
    `Created ${recording.length}-byte synthetic 440 Hz browser recording; no microphone or patient recording used.`,
  );
} finally {
  await browser.close();
}
