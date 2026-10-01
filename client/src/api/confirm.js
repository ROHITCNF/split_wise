/**
 * The confirmation pattern from API_CONTRACT §1.3: send without confirm; if the
 * server answers 409 CONFIRMATION_REQUIRED, ask the user (showing `details`) and,
 * if they agree, send again with confirm.
 *
 * @template T
 * @param {(confirm: boolean) => Promise<T>} send  performs the call
 * @param {(error: import('./client.js').ApiError) => Promise<boolean>} ask  shows the dialog
 * @returns {Promise<{ done: true, result: T } | { done: false }>}  done=false when the user cancels
 */
export async function withConfirmation(send, ask) {
  try {
    return { done: true, result: await send(false) };
  } catch (err) {
    if (err?.code !== 'CONFIRMATION_REQUIRED') throw err;
    if (!(await ask(err))) return { done: false };
    return { done: true, result: await send(true) };
  }
}
