"use client";

// The passcode field. Its own client component for one reason: a React 19
// Server-Action <form> doesn't get the browser's implicit "press Enter to
// submit", so on a keyboard the doctor had to reach for the mouse. Handle Enter
// ourselves — requestSubmit() runs the form's action exactly as the button
// does. `enterKeyHint="go"` also labels the on-screen keyboard's return key.
export default function PasscodeInput() {
  return (
    <input
      name="passcode"
      type="password"
      inputMode="numeric"
      enterKeyHint="go"
      autoFocus
      autoComplete="current-password"
      placeholder="Passcode"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
      className="w-full rounded-xl bg-sunk px-4 py-3.5 text-center text-[22px] tracking-[0.3em] outline-none placeholder:text-[17px] placeholder:tracking-normal placeholder:text-ink2"
    />
  );
}
