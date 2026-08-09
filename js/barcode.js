import { getItem, setItem } from './storage.js';

const CACHE_KEY = 'barcodeCache';

export function getCachedProduct(barcode) {
  const cache = getItem(CACHE_KEY, {});
  return cache[barcode] || null;
}

function cacheProduct(barcode, record) {
  const cache = getItem(CACHE_KEY, {});
  cache[barcode] = record;
  setItem(CACHE_KEY, cache);
}

export function listCachedProducts() {
  return getItem(CACHE_KEY, {});
}

/**
 * Looks up a barcode via Open Food Facts (free, no key, no auth). Caches the
 * result locally so a repeat scan is instant and works offline. Prefers
 * per-serving nutriment fields when the product defines a serving size,
 * falling back to per-100g values -- `basis` tells the UI which it got so it
 * can label the number honestly instead of implying a false precision.
 */
export async function lookupBarcode(barcode, { skipCache = false } = {}) {
  if (!skipCache) {
    const cached = getCachedProduct(barcode);
    if (cached) return cached;
  }

  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) throw new Error(`Open Food Facts request failed (${res.status})`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    throw new Error('Product not found in Open Food Facts');
  }

  const p = data.product;
  const n = p.nutriments || {};
  const hasServing = n['energy-kcal_serving'] != null;

  const record = {
    barcode,
    name: p.product_name || p.generic_name || `Unknown product (${barcode})`,
    brand: p.brands || null,
    servingDesc: hasServing ? p.serving_size || 'per serving' : '100 g',
    basis: hasServing ? 'serving' : '100g',
    calories: hasServing ? n['energy-kcal_serving'] : n['energy-kcal_100g'] ?? null,
    protein: hasServing ? n['proteins_serving'] : n['proteins_100g'] ?? null,
    carbs: hasServing ? n['carbohydrates_serving'] : n['carbohydrates_100g'] ?? null,
    fat: hasServing ? n['fat_serving'] : n['fat_100g'] ?? null,
    cachedAt: new Date().toISOString(),
  };
  cacheProduct(barcode, record);
  return record;
}

export function isBarcodeDetectorSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Opens the rear camera and resolves with the first detected barcode value.
 * Caller is responsible for tearing down (stopScanner) on cancel/unmount.
 */
export async function startScanner(videoEl, onDetected, onError) {
  if (!isBarcodeDetectorSupported()) {
    onError(new Error('BarcodeDetector not supported on this device'));
    return null;
  }
  const detector = new window.BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
  });

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    onError(err);
    return null;
  }
  videoEl.srcObject = stream;
  await videoEl.play();

  let stopped = false;
  async function tick() {
    if (stopped) return;
    try {
      const codes = await detector.detect(videoEl);
      if (codes.length) {
        onDetected(codes[0].rawValue);
        return; // caller decides whether to keep scanning
      }
    } catch (err) {
      // Transient detection errors are common (frame not ready); ignore.
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
