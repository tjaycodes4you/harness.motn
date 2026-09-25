import { Global } from "@opencode-ai/core/global"
import path from "path"
import { Effect } from "effect"

/**
 * On-disk marker for a running background task. The in-memory job registry is
 * process-local, so a process death loses every job. A marker file survives and
 * lets boot recovery reconcile the parent tool part and the child session.
 */
export type Info = {
  childSessionID: string
  parentSessionID: string
  directory: string
  title?: string
  startedAt: number
}

const directory = path.join(Global.Path.data, "background-jobs")

function file(childSessionID: string) {
  return path.join(directory, `${childSessionID}.json`)
}

export function write(info: Info) {
  return Effect.tryPromise({
    try: () => Bun.write(file(info.childSessionID), JSON.stringify(info)),
    catch: (error) => error,
  }).pipe(Effect.ignore)
}

export function remove(childSessionID: string) {
  return Effect.tryPromise({
    try: () => Bun.file(file(childSessionID)).delete(),
    catch: (error) => error,
  }).pipe(Effect.ignore)
}

export function list() {
  return Effect.tryPromise({
    try: async () => {
      const glob = new Bun.Glob("*.json")
      const markers: Info[] = []
      for await (const name of glob.scan({ cwd: directory, onlyFiles: true })) {
        const value: unknown = await Bun.file(path.join(directory, name))
          .json()
          .catch(() => undefined)
        if (!value || typeof value !== "object") continue
        const info = value as Partial<Info>
        if (typeof info.childSessionID !== "string") continue
        if (typeof info.parentSessionID !== "string") continue
        if (typeof info.directory !== "string") continue
        markers.push({
          childSessionID: info.childSessionID,
          parentSessionID: info.parentSessionID,
          directory: info.directory,
          title: typeof info.title === "string" ? info.title : undefined,
          startedAt: typeof info.startedAt === "number" ? info.startedAt : 0,
        })
      }
      return markers
    },
    catch: (error) => error,
  }).pipe(Effect.catch(() => Effect.succeed([] as Info[])))
}

export * as Marker from "./marker"
