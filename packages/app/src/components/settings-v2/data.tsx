import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { motnPost } from "@/utils/motn-api"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

export function SettingsDataV2() {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [syncing, setSyncing] = createSignal(false)

  const sync = async () => {
    if (syncing()) return
    setSyncing(true)
    try {
      const result = await motnPost<{ inserted: number }>(serverSdk().server.http, "/experimental/motn/sync")
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.data.sync.title"),
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
      setSyncing(false)
    }
  }

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.data.section")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.data.sync.title")}
          description={language.t("settings.data.sync.description")}
        >
          <div data-action="settings-motn-sync">
            <ButtonV2 size="normal" variant="neutral" disabled={syncing()} onClick={() => void sync()}>
              {language.t("settings.data.sync.button")}
            </ButtonV2>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}
