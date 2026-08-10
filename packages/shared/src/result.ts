/**
 * Typed command results.
 *
 * Domain commands never throw raw provider/database errors at callers; they
 * return a discriminated result so route handlers can map failures onto player
 * facing copy without leaking internals.
 */

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Unwraps a result in contexts (seeds, tests) where failure is a bug. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`Expected ok result, got error: ${JSON.stringify(result.error)}`);
}
