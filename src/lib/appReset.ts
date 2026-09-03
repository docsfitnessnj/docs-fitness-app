// A minimal registration channel for triggering a full app remount from
// deep inside the provider tree (Settings, several providers down) without
// prop-drilling a callback through nine context providers — same pattern
// as showAlert/useAlertState in alert.ts.
let resetRef: (() => void) | null = null;

export function requestAppReset() {
  resetRef?.();
}

export function registerAppReset(fn: (() => void) | null) {
  resetRef = fn;
}
