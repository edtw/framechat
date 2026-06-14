/**
 * Safe API Response Helpers
 *
 * Prevents the "X.filter is not a function" class of runtime crashes
 * caused by inconsistent API response envelope shapes.
 *
 * Common backend response shapes:
 *   { success: true, items: [...] }       // flat list
 *   { success: true, data: [...] }        // data envelope
 *   { success: true, data: { items: [] }} // nested
 *   [...]                                  // raw array
 *   { items: [...] }                       // no success wrapper
 */

type ApiResponseData = Record<string, unknown> | unknown[] | null | undefined;

/**
 * Safely extract an array from an API response, trying multiple known shapes.
 * Always returns an array — never throws, never returns a non-array.
 */
export function extractList(
  responseData: ApiResponseData,
  preferredKey?: string
): unknown[] {
  if (Array.isArray(responseData)) return responseData;

  if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
    const obj = responseData as Record<string, unknown>;

    // 1. Try preferred key (e.g., "transactions", "sessions", "leads")
    if (preferredKey && Array.isArray(obj[preferredKey])) {
      return obj[preferredKey] as unknown[];
    }

    // 2. Try common envelope keys
    const envelopeKeys = ['data', 'items', 'results', 'records', 'list'];
    for (const key of envelopeKeys) {
      const val = obj[key];
      if (Array.isArray(val)) return val;
    }

    // 3. Try any array-valued key
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return val;
    }
  }

  return [];
}

/**
 * Safely extract a single item from an API response.
 * Returns the item or null.
 */
export function extractItem(
  responseData: ApiResponseData,
  preferredKey?: string
): Record<string, unknown> | null {
  if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
    const obj = responseData as Record<string, unknown>;

    if (preferredKey && obj[preferredKey] && typeof obj[preferredKey] === 'object') {
      return obj[preferredKey] as Record<string, unknown>;
    }

    for (const key of ['data', 'item', 'result', 'record']) {
      const val = obj[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return val as Record<string, unknown>;
      }
    }

    // If the response itself looks like a data object (no envelope), return it
    if (obj.id || obj.name || obj.title) {
      return obj;
    }
  }

  return null;
}

/**
 * Wrap a value in an array if it isn't one already.
 */
export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}
