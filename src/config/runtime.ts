/**
 * Browser-reported hardware values outside these ranges are ignored.
 * Atlas does not estimate GPU memory; these caps only reject nonsense numbers.
 */
export const MAX_REASONABLE_DEVICE_MEMORY_GB = 128;

export const MAX_REASONABLE_HARDWARE_CONCURRENCY = 256;
