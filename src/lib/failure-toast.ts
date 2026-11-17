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

// One place for the success toast: same id rule as the failure toast,
// so a repeat success replaces the old toast instead of stacking.
// toast.success renders a check icon in the Toaster's brand styling
// (richColors stays off); use it only where success is otherwise
// silent, never where the page already shows the result inline.
export function showSuccessToast(title: string) {
  toast.success(title, { id: title });
}
