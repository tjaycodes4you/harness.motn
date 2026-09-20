import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { motnPost } from "@/utils/motn-api"
import { showToast } from "@/utils/toast"

export function DialogNewProject(props: { server: ServerConnection.Any; onCreated: (path: string) => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const [path, setPath] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  async function create() {
    const value = path().trim()
    const server = (props.server as { http?: ServerConnection.HttpBase }).http
    if (!value || !server || busy()) return
    setBusy(true)
    try {
      const result = await motnPost<{ path: string }>(server, "/experimental/motn/mkdir", { path: value })
      props.onCreated(result.path)
      dialog.close()
    } catch (cause) {
      showToast({
        title: language.t("common.requestFailed"),
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog class="w-full max-w-[440px]">
      <DialogHeader>
        <DialogTitle>{language.t("home.project.new")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <TextInputV2
          value={path()}
          autofocus
          autocomplete="off"
          spellcheck={false}
          class="!w-full"
          placeholder={language.t("dialog.newProject.path")}
          onInput={(event) => setPath(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void create()
            }
          }}
        />
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="neutral" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          data-action="new-project-create"
          variant="contrast"
          disabled={!path().trim() || busy()}
          onClick={() => void create()}
        >
          {language.t("common.create")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
