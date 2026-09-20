import { useCommand } from "@/context/command"
import { parseHomeSessionIndex } from "@/context/global-sync/home-session-index"
import { useLanguage } from "@/context/language"
import { serverName } from "@/context/server"
import { displayName, projectForSession } from "@/pages/layout/helpers"
import { makeEventListener } from "@solid-primitives/event-listener"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { HomeController } from "./home-controller"
import { homeSessionSearchKey, type HomeSessionRecord, type HomeSessionsController } from "./home-sessions-controller"

type HomeSessionSearchSource = Pick<HomeSessionsController, "data" | "session">

const SEARCH_DEBOUNCE_MS = 120
const SEARCH_RESULT_LIMIT = 50

export function createHomeSessionSearchController(home: HomeController, sessions: HomeSessionSearchSource) {
  const command = useCommand()
  const language = useLanguage()
  const [state, setState] = createStore({ value: "", focused: false, highlighted: "" })
  let root: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  let list: HTMLDivElement | undefined
  const query = createMemo(() => state.value.trim())
  const localResults = createMemo(() => {
    const value = query().toLowerCase()
    if (!value) return []
    return sessions.data
      .searchRecords()
      .filter((record) => `${record.session.title} ${record.projectName}`.toLowerCase().includes(value))
  })
  // The visible box searches every session the server knows, not just projects
  // the browser has opened. Server search is authoritative; the local index is
  // only merged in for instant results on already-known projects.
  const [remoteResults, setRemoteResults] = createSignal<HomeSessionRecord[]>([])
  const [remoteLoading, setRemoteLoading] = createSignal(false)
  let searchAbort: AbortController | undefined
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(() => {
    const value = state.focused ? query() : ""
    clearTimeout(searchTimer)
    searchAbort?.abort()
    if (!value) {
      setRemoteResults([])
      setRemoteLoading(false)
      return
    }
    searchTimer = setTimeout(async () => {
      const ctx = home.server.focusedContext()
      if (!ctx) return
      const current = new AbortController()
      searchAbort = current
      setRemoteLoading(true)
      try {
        const result = await ctx.sdk.client.v2.session.list(
          { search: value, limit: SEARCH_RESULT_LIMIT, order: "desc" },
          { signal: current.signal },
        )
        if (current.signal.aborted) return
        setRemoteResults(toSearchRecords(parseHomeSessionIndex(result.data?.data ?? []), home))
      } catch {
        if (!current.signal.aborted) setRemoteResults([])
      } finally {
        if (!current.signal.aborted) setRemoteLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  })
  onCleanup(() => {
    clearTimeout(searchTimer)
    searchAbort?.abort()
  })
  const results = createMemo(() => {
    const value = query().toLowerCase()
    if (!value) return []
    const remote = remoteResults()
    if (remote.length === 0) return localResults()
    const seen = new Set<string>()
    return [...localResults(), ...remote].filter((record) => {
      const key = homeSessionSearchKey(record)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })
  const active = createMemo(() => {
    const records = results()
    if (records.some((record) => homeSessionSearchKey(record) === state.highlighted)) return state.highlighted
    return records[0] ? homeSessionSearchKey(records[0]) : ""
  })
  const open = createMemo(() => state.focused && query().length > 0)
  const placeholder = createMemo(() => {
    const project = home.project.selected()
    if (project) return language.t("home.sessions.search.placeholder.scoped", { scope: displayName(project) })
    if (home.server.list().length > 1) {
      const conn = home.server.focused()
      if (conn) return language.t("home.sessions.search.placeholder.scoped", { scope: serverName(conn) })
    }
    return language.t("home.sessions.search.placeholder")
  })

  onCleanup(
    makeEventListener(document, "pointerdown", (event) => {
      if (!open()) return
      const target = event.target
      if (!(target instanceof Node) || root?.contains(target)) return
      close()
    }),
  )

  command.register("home.search", () => [
    {
      id: "home.sessions.search.focus",
      title: placeholder(),
      keybind: "mod+f",
      hidden: true,
      onSelect: focus,
    },
  ])

  function focus() {
    input?.focus()
    setState("focused", true)
  }

  function close() {
    setState({ value: "", focused: false })
  }

  function select(record: HomeSessionRecord, options?: { background?: boolean }) {
    sessions.session.open(record.session, options)
    if (!options?.background) close()
  }

  return {
    query: {
      value: () => state.value,
      placeholder,
      open,
      focus,
      input: (value: string) => setState({ value, highlighted: "" }),
      close,
    },
    result: {
      loading: () => sessions.data.loading() || remoteLoading(),
      list: results,
      active,
      noResultsLabel: () => language.t("home.sessions.search.noResults", { query: query() }),
      highlight: (record: HomeSessionRecord) => setState("highlighted", homeSessionSearchKey(record)),
      move: (delta: number) => {
        const records = results()
        if (records.length === 0) return
        const index = records.findIndex((record) => homeSessionSearchKey(record) === active())
        const next = ((index === -1 ? 0 : index) + delta + records.length) % records.length
        setState("highlighted", homeSessionSearchKey(records[next]))
        list?.querySelector<HTMLElement>(`[data-key="${state.highlighted}"]`)?.scrollIntoView({ block: "nearest" })
      },
      select,
      selectActive: () => {
        const record = results().find((item) => homeSessionSearchKey(item) === active())
        if (record) select(record)
      },
    },
    element: {
      setRoot: (element: HTMLDivElement) => (root = element),
      setInput: (element: HTMLInputElement) => (input = element),
      setList: (element: HTMLDivElement) => (list = element),
    },
  }
}

export type HomeSessionSearchController = ReturnType<typeof createHomeSessionSearchController>

function toSearchRecords(sessions: Session[], home: HomeController): HomeSessionRecord[] {
  const projects = home.project.list()
  const byID = new Map(projects.flatMap((project) => (project.id ? [[project.id, project] as const] : [])))
  return sessions.map((session) => {
    const project = projectForSession(session, projects, byID) ?? { worktree: session.directory, expanded: false }
    return { session, project, projectName: displayName(project) }
  })
}

