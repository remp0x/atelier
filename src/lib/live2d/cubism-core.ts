const CORE_SRC = '/live2d/core/live2dcubismcore.min.js';

let loadPromise: Promise<void> | null = null;

export function loadCubismCore(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cubism Core requires a browser environment'));
  }
  if ('Live2DCubismCore' in window) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CORE_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Cubism Core')));
      return;
    }
    const script = document.createElement('script');
    script.src = CORE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Cubism Core'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
