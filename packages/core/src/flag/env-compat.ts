// Maps MOTN_* environment variables onto their OPENCODE_* equivalents so the
// harness can be driven with the MOTN_ prefix while upstream-compatible flag
// reads (process.env["OPENCODE_*"]) stay untouched for mergeability.
// Must run before any flag value is read; `flag.ts` imports this first.
for (const key of Object.keys(process.env)) {
  if (!key.startsWith("MOTN_")) continue
  const compat = `OPENCODE_${key.slice("MOTN_".length)}`
  if (process.env[compat] === undefined) process.env[compat] = process.env[key]
}
