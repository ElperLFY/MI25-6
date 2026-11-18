function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function recordTiming(options, stage, startedAt, details = {}) {
  if (!Array.isArray(options?.timings)) return;
  options.timings.push({
    dataset: options.datasetKey || "unknown",
    stage,
    durationMs: Math.max(0, nowMs() - startedAt),
    ...details
  });
}

export function measureSync(options, stage, callback, details = {}) {
  if (!Array.isArray(options?.timings)) return callback();
  const startedAt = nowMs();
  try {
    return callback();
  } finally {
    recordTiming(options, stage, startedAt, details);
  }
}

export async function measureAsync(options, stage, callback, details = {}) {
  if (!Array.isArray(options?.timings)) return callback();
  const startedAt = nowMs();
  try {
    return await callback();
  } finally {
    recordTiming(options, stage, startedAt, details);
  }
}

export { nowMs };
