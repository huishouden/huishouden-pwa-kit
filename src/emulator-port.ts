/** A port from a build or test variable, or the emulator's default. */
export function emulatorPort(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}
