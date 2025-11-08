// Basic sleep and exponential backoff helpers
export const sleep = (ms) => new Promise(res => setTimeout(res, ms));

export async function withBackoff(fn, {
  retries = 4,
  baseDelay = 500,
  onRetry = (e, attempt, delay) => console.warn(`Retry ${attempt} in ${delay}ms`, e?.message || e)
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt > retries) throw e;
      const delay = Math.round(baseDelay * Math.pow(2, attempt - 1) * (0.75 + Math.random()*0.5));
      onRetry(e, attempt, delay);
      await sleep(delay);
    }
  }
}