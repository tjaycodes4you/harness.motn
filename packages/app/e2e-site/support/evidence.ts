import { appendFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { evidenceDir } from "./env"

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

export function writeJson(name: string, value: unknown) {
  const file = path.join(evidenceDir(), name)
  writeFileSync(file, JSON.stringify(value, null, 2))
  return file
}

export function writeText(name: string, value: string) {
  const file = path.join(evidenceDir(), name)
  writeFileSync(file, value)
  return file
}

export function appendJsonl(name: string, value: unknown) {
  appendFileSync(path.join(evidenceDir(), name), `${JSON.stringify(value)}\n`)
}
