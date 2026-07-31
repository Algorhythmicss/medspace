import { Lock } from "lucide-react";
import { signOut } from "@/app/actions";

// Clinic devices are shared and left on the desk. One tap re-locks the app.
export default function LockButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label="Lock medSpace"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-label2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:opacity-60"
      >
        <Lock size={16} strokeWidth={2} />
      </button>
    </form>
  );
}
