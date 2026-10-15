export interface PwaStatus {
  offline: boolean;
  updateReady: boolean;
  updateApplying: boolean;
  updateError?: string;
  installed: boolean;
}

const updateGuards = new Set<() => boolean | Promise<boolean>>();
/** Register while a tab owns work that must be saved before all tabs reload. */
export function registerPwaUpdateGuard(guard: () => boolean | Promise<boolean>): () => void {
  updateGuards.add(guard);
  return () => { updateGuards.delete(guard); };
}

const listeners = new Set<(state: PwaStatus) => void>();
let registration: ServiceWorkerRegistration | undefined;
let started = false;
let reloadOnChange = false;
let state: PwaStatus = {
  offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  updateReady: false,
  updateApplying: false,
  installed: typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true),
};

function update(patch: Partial<PwaStatus>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
  window.dispatchEvent(new CustomEvent('panels:pwa-status', { detail: state }));
}

export function getPwaStatus(): PwaStatus { return state; }
export function subscribePwaStatus(listener: (status: PwaStatus) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Updates activate only on user request so a new build cannot discard a draft. */
export function applyPwaUpdate(): void {
  if (!registration?.waiting) return;
  update({ updateApplying: true, updateError: undefined });
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
}

export function registerPwa(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => update({ offline: false }));
  window.addEventListener('offline', () => update({ offline: true }));
  window.addEventListener('appinstalled', () => update({ installed: true }));
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'PREPARE_UPDATE') {
      update({ updateApplying: true, updateError: undefined });
      void Promise.all([...updateGuards].map(async (guard) => {
        try { return await guard(); } catch { return false; }
      })).then((results) => {
        event.source?.postMessage({ type: 'UPDATE_ACK', token: event.data.token, ready: results.every(Boolean) });
      });
    } else if (event.data?.type === 'COMMIT_UPDATE') {
      reloadOnChange = true;
      event.source?.postMessage({ type: 'UPDATE_COMMIT_ACK', token: event.data.token, ready: true });
    } else if (event.data?.type === 'UPDATE_BLOCKED') {
      reloadOnChange = false;
      update({ updateApplying: false, updateError: event.data.message });
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnChange) window.location.reload();
  });
  const install = async () => {
    try {
      registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
      if (registration.waiting) update({ updateReady: true });
      registration.addEventListener('updatefound', () => {
        const worker = registration?.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) update({ updateReady: true });
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
      });
    } catch { /* App remains usable when a browser or hosting policy denies installation. */ }
  };
  if (document.readyState === 'complete') void install();
  else window.addEventListener('load', () => { void install(); }, { once: true });
}
