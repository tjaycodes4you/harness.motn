import type { Page } from "@playwright/test"

// Console noise that is not an app defect.
const benign = [/MaxListenersExceededWarning/i, /favicon/i, /ERR_INTERNET_DISCONNECTED/i]

// Matches @opencode-ai/core/util/encode base64Encode (url-safe, unpadded).
export function base64Encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export function sessionHref(sessionID: string, baseURL: string | undefined) {
  return `/server/${base64Encode((baseURL ?? "").replace(/\/$/, ""))}/session/${sessionID}`
}

export function trackErrors(page: Page) {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(String(error)))
  return errors
}

export function appErrors(errors: string[]) {
  return errors.filter((error) => !benign.some((pattern) => pattern.test(error)))
}
