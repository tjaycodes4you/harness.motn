import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Spinner } from "@opencode-ai/ui/spinner"
import { createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { motnPost } from "@/utils/motn-api"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

type SyncResult = { inserted: number }
type Direction = "pull" | "push"

const ROUTES: Record<Direction, string> = {
  pull: "/experimental/motn/sync",
  push: "/experimental/motn/sync-push",
}

const COPY: Record<Direction, { title: string; description: string; button: string }> = {
  pull: {
    title: "settings.data.sync.title",
    description: "settings.data.sync.description",
    button: "settings.data.sync.button",
  },
  push: {
    title: "settings.data.push.title",
    description: "settings.data.push.description",
    button: "settings.data.push.button",
  },
}

export function SettingsDataV2() {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [busy, setBusy] = createSignal<Direction | undefined>(undefined)
  const [elapsed, setElapsed] = createSignal(0)
  let timer: ReturnType<typeof setInterval> | undefined

  onCleanup(() => clearInterval(timer))

  const run = async (direction: Direction) => {
    if (busy()) return
    setBusy(direction)
    setElapsed(0)
    const started = Date.now()
    timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    try {
      const result = await motnPost<SyncResult>(serverSdk().server.http, ROUTES[direction])
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t(COPY[direction].title),
        description:
          result.inserted > 0
            ? language.t("settings.data.sync.done", { count: result.inserted })
            : language.t("settings.data.sync.uptodate"),
      })
    } catch (cause) {
      showToast({
        title: language.t("common.requestFailed"),
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      clearInterval(timer)
      setBusy(undefined)
    }
  }

  const control = (direction: Direction) => (
    <Show
      when={busy() === direction}
      fallback={
        <div data-action={`settings-motn-sync-${direction}`}>
          <ButtonV2 size="normal" variant="neutral" disabled={!!busy()} onClick={() => void run(direction)}>
            {language.t(COPY[direction].button)}
          </ButtonV2>
        </div>
      }
    >
      <div
        data-action={`settings-motn-sync-${direction}`}
        class="flex items-center gap-2 text-v2-text-text-muted"
        role="status"
        aria-live="polite"
      >
        <Spinner class="size-4" />
        <span class="text-[13px] [font-weight:440] tabular-nums">
          {language.t("settings.data.sync.running")} {elapsed()}s
        </span>
      </div>
    </Show>
  )

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.data.section")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.data.sync.title")}
          description={language.t("settings.data.sync.description")}
        >
          {control("pull")}
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.data.push.title")}
          description={language.t("settings.data.push.description")}
        >
          {control("push")}
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}
