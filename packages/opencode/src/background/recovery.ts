import { SessionV1 } from "@opencode-ai/core/v1/session"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { Marker } from "./marker"

export interface Interface {
  readonly init: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/BackgroundRecovery") {}

const RESTART_ERROR = "Background task interrupted by a server restart"

function renderNotice(input: { childSessionID: string; title?: string }) {
  return [
    `<task id="${input.childSessionID}" state="error">`,
    ...(input.title ? [`<summary>Background task failed: ${input.title}</summary>`] : []),
    "<task_error>",
    `${RESTART_ERROR}.`,
    "</task_error>",
    "</task>",
  ].join("\n")
}

/**
 * Reconciles background tasks that were running when the process stopped. The
 * durable marker files name the parent tool part and the child session, so a
 * fresh process can mark a still-running part error, append the completion
 * notice the dead process never delivered (model + UI both read it), and
 * finalize the child's dangling assistant turn. The in-memory job registry
 * intentionally stays process-local; this is the durable slice.
 */
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const flags = yield* RuntimeFlags.Service

    const finalizeChild = Effect.fnUntraced(function* (childSessionID: SessionID) {
      const child = yield* sessions.get(childSessionID).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      if (!child) return
      const messages = yield* sessions
        .messages({ sessionID: child.id, limit: 20 })
        .pipe(Effect.catchCause(() => Effect.succeed([])))
      const last = messages.findLast((message) => message.info.role === "assistant")
      if (!last || last.info.role !== "assistant" || last.info.time.completed) return
      yield* sessions
        .updateMessage({
          ...last.info,
          finish: "error",
          error: { name: "MessageAbortedError", data: { message: RESTART_ERROR } },
          time: { ...last.info.time, completed: Date.now() },
        })
        .pipe(Effect.ignore)
    })

    const notify = Effect.fnUntraced(function* (marker: Marker.Info, parent: Session.Info) {
      if (!parent.model) return
      const messageID = MessageID.ascending()
      yield* sessions
        .updateMessage({
          id: messageID,
          role: "user",
          sessionID: parent.id,
          agent: parent.agent ?? "build",
          model: {
            providerID: parent.model.providerID,
            modelID: parent.model.id,
            ...(parent.model.variant ? { variant: parent.model.variant } : {}),
          },
          time: { created: Date.now() },
        })
        .pipe(Effect.ignore)
      yield* sessions
        .updatePart({
          id: PartID.ascending(),
          messageID,
          sessionID: parent.id,
          type: "text",
          synthetic: true,
          text: renderNotice({ childSessionID: marker.childSessionID, title: marker.title }),
          metadata: {
            backgroundTask: {
              sessionID: marker.childSessionID,
              state: "error",
              title: marker.title,
            },
          },
        })
        .pipe(Effect.ignore)
    })

    const reconcile = Effect.fnUntraced(function* (marker: Marker.Info) {
      const parent = yield* sessions.get(SessionID.make(marker.parentSessionID)).pipe(
        Effect.catchCause(() => Effect.succeed(undefined)),
      )
      if (parent) {
        const messages = yield* sessions
          .messages({ sessionID: parent.id })
          .pipe(Effect.catchCause(() => Effect.succeed([])))
        const parts = messages.flatMap((message) =>
          message.parts.filter((part): part is SessionV1.ToolPart => {
            if (part.type !== "tool" || part.tool !== "task") return false
            if (!("metadata" in part.state)) return false
            const metadata = part.state.metadata
            return metadata?.background === true && metadata?.jobId === marker.childSessionID
          }),
        )
        yield* Effect.forEach(
          parts,
          (part) => {
            if (part.state.status !== "running") return Effect.void
            return sessions
              .updatePart({
                ...part,
                state: {
                  ...part.state,
                  status: "error",
                  error: RESTART_ERROR,
                  metadata: { ...part.state.metadata, interrupted: true },
                  time: { start: part.state.time.start, end: Date.now() },
                },
              })
              .pipe(Effect.ignore)
          },
          { discard: true },
        )
        if (parts.length > 0) yield* notify(marker, parent)
      }
      yield* finalizeChild(SessionID.make(marker.childSessionID))
      yield* Marker.remove(marker.childSessionID)
      yield* Effect.logInfo("reconciled background task interrupted by restart", {
        "session.id": marker.parentSessionID,
        child: marker.childSessionID,
      })
    })

    const init = Effect.fn("BackgroundRecovery.init")(function* () {
      if (!flags.experimentalBackgroundSubagents) return
      const ctx = yield* InstanceState.context
      const markers = (yield* Marker.list()).filter((marker) => marker.directory === ctx.directory)
      yield* Effect.forEach(markers, reconcile, { discard: true })
    })

    return Service.of({ init })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Session.node, RuntimeFlags.node],
})

export * as BackgroundRecovery from "./recovery"
