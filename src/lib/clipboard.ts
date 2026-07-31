// `navigator.clipboard` only exists in a secure context. localhost qualifies;
// a clinic machine reaching the app over plain http on the LAN does not, and
// neither do several old Android WebViews. Since copying the plan link is one
// of only two ways a patient ever receives it, a Copy button that silently
// does nothing is a broken distribution channel — so try the modern API, fall
// back to the legacy selection trick, and report honestly when both fail so
// the caller can show the link instead.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // permission denied or blocked — fall through to the legacy path
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // keep it off-screen but still selectable, and don't scroll the page
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
