import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Effect, Layer } from "effect"
import { BackgroundRecovery } from "@/background/recovery"
import { Marker } from "@/background/marker"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const layer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([
      BackgroundRecovery.node,
      Config.node,
      Database.node,
      Session.node,
      SessionProjector.node,
      RuntimeFlags.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const background = testEffect(layer({ experimentalBackgroundSubagents: true }))

function assistantMessage(input: { sessionID: SessionID; parentID: MessageID; completed?: number }) {
  const message: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: input.parentID,
    sessionID: input.sessionID,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now(), ...(input.completed ? { completed: input.completed } : {}) },
  }
  return message
}

function toolPart(input: {
  sessionID: SessionID
  messageID: MessageID
  childSessionID: SessionID
  status: "running" | "completed"
}): SessionV1.ToolPart {
  return {
    id: PartID.ascending(),
    messageID: input.messageID,
    sessionID: input.sessionID,
    type: "tool",
    callID: `call_${Math.random().toString(36).slice(2)}`,
    tool: "task",
    state:
      input.status === "running"
        ? {
            status: "running",
            input: {},
            time: { start: Date.now() },
            metadata: { background: true, jobId: input.childSessionID },
          }
        : {
            status: "completed",
            input: {},
            output: "Background task started",
            title: "task",
            time: { start: Date.now(), end: Date.now() },
            metadata: { background: true, jobId: input.childSessionID },
          },
  }
}

describe("background recovery", () => {
  background.instance("reconciles a completed detached task that lost its process", () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const sessions = yield* Session.Service

      const parent = yield* sessions.create({ title: "parent", model: { id: ref.modelID, providerID: ref.providerID } })
      const parentUser = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: parent.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })
      const parentAssistant = yield* sessions.updateMessage(
        assistantMessage({ sessionID: parent.id, parentID: parentUser.id }),
      )
      const child = yield* sessions.create({ parentID: parent.id, title: "child" })
      const childUser = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: child.id,
        agent: "general",
        model: ref,
        time: { created: Date.now() },
      })
      const childAssistant = yield* sessions.updateMessage(
        assistantMessage({ sessionID: child.id, parentID: childUser.id }),
      )

      const part = toolPart({
        sessionID: parent.id,
        messageID: parentAssistant.id,
        childSessionID: child.id,
        status: "completed",
      })
      yield* sessions.updatePart(part)
      yield* Marker.write({
        childSessionID: child.id,
        parentSessionID: parent.id,
        directory: instance.directory,
        title: "interrupted task",
        startedAt: Date.now(),
      })

      const recovery = yield* BackgroundRecovery.Service
      yield* recovery.init()

      const parentMessages = yield* sessions.messages({ sessionID: parent.id })
      const parentParts = parentMessages.flatMap((message) => message.parts)
      const original = parentParts.find((item) => item.type === "tool" && item.id === part.id)
      expect(original?.type === "tool" && original.state.status).toBe("completed")

      const notices = parentParts.filter(
        (item) => item.type === "text" && item.metadata?.backgroundTask !== undefined,
      )
      expect(notices.length).toBe(1)
      const notice = notices[0]
      if (notice?.type !== "text") return
      const marker = notice.metadata?.backgroundTask as { sessionID?: string; state?: string; title?: string }
      expect(marker.sessionID).toBe(child.id)
      expect(marker.state).toBe("error")
      expect(marker.title).toBe("interrupted task")

      const childLast = (yield* sessions.messages({ sessionID: child.id })).findLast(
        (message) => message.info.role === "assistant",
      )
      expect(childLast?.info.role).toBe("assistant")
      if (childLast?.info.role !== "assistant") return
      expect(childLast.info.finish).toBe("error")
      expect(typeof childLast.info.time.completed).toBe("number")
      expect((childLast.info.error as { name?: string } | undefined)?.name).toBe("MessageAbortedError")
      expect(childLast.info.id).toBe(childAssistant.id)

      const markers = yield* Marker.list()
      expect(markers.some((item) => item.childSessionID === child.id)).toBe(false)
    }),
  )

  background.instance("marks a still-running part error and notifies the parent", () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const sessions = yield* Session.Service

      const parent = yield* sessions.create({ title: "parent", model: { id: ref.modelID, providerID: ref.providerID } })
      const parentUser = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: parent.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })
      const parentAssistant = yield* sessions.updateMessage(
        assistantMessage({ sessionID: parent.id, parentID: parentUser.id }),
      )
      const child = yield* sessions.create({ parentID: parent.id, title: "child" })

      const part = toolPart({
        sessionID: parent.id,
        messageID: parentAssistant.id,
        childSessionID: child.id,
        status: "running",
      })
      yield* sessions.updatePart(part)
      yield* Marker.write({
        childSessionID: child.id,
        parentSessionID: parent.id,
        directory: instance.directory,
        title: "running task",
        startedAt: Date.now(),
      })

      const recovery = yield* BackgroundRecovery.Service
      yield* recovery.init()

      const parentParts = (yield* sessions.messages({ sessionID: parent.id })).flatMap((message) => message.parts)
      const updated = parentParts.find((item) => item.type === "tool" && item.id === part.id)
      expect(updated?.type).toBe("tool")
      if (updated?.type !== "tool") return
      expect(updated.state.status).toBe("error")
      if (updated.state.status !== "error") return
      expect(updated.state.metadata?.interrupted).toBe(true)
      expect(updated.state.error).toContain("restart")

      expect(
        parentParts.some(
          (item) => item.type === "text" && item.metadata?.backgroundTask !== undefined,
        ),
      ).toBe(true)

      const markers = yield* Marker.list()
      expect(markers.some((item) => item.childSessionID === child.id)).toBe(false)
    }),
  )

  background.instance("ignores markers for other directories", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const parent = yield* sessions.create({ title: "other-dir-parent" })
      const parentUser = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: parent.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })
      const parentAssistant = yield* sessions.updateMessage(
        assistantMessage({ sessionID: parent.id, parentID: parentUser.id }),
      )
      const child = yield* sessions.create({ parentID: parent.id, title: "other-dir-child" })
      const part = toolPart({
        sessionID: parent.id,
        messageID: parentAssistant.id,
        childSessionID: child.id,
        status: "running",
      })
      yield* sessions.updatePart(part)
      yield* Marker.write({
        childSessionID: child.id,
        parentSessionID: parent.id,
        directory: "C:\\somewhere-else",
        title: "other dir",
        startedAt: Date.now(),
      })

      const recovery = yield* BackgroundRecovery.Service
      yield* recovery.init()

      const parentParts = (yield* sessions.messages({ sessionID: parent.id })).flatMap((message) => message.parts)
      const untouched = parentParts.find((item) => item.type === "tool" && item.id === part.id)
      expect(untouched?.type === "tool" && untouched.state.status).toBe("running")
      expect(parentParts.some((item) => item.type === "text" && item.metadata?.backgroundTask)).toBe(false)

      yield* Marker.remove(child.id)
    }),
  )
})
