import { toast } from "sonner";

// One place for the failure toast: same title, a Retry action, and the
// title doubles as the toast id so a repeat failure replaces the old
// toast instead of stacking, and a new attempt can dismiss it.
// Duration (4000ms), close button and position live on the Toaster.
export function showFailureToast(title: string, retry: () => void) {
  toast(title, { id: title, action: { label: "Retry", onClick: retry } });
}

export function dismissFailureToast(title: string) {
  toast.dismiss(title);
}
