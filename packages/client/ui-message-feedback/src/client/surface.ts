/**
 * One Session's feedback surface: the message-feedback object layer and the
 * dialog controller, plus the routing between them. A message target puts a
 * selected judgment through the message controller; the Session target submits
 * through the `sessionFeedback` Remote.
 * @module @deepseek-ai/dsh-client-ui-message-feedback/client/surface
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FeedbackRecord } from '@deepseek-ai/dsh-command-feedback/types'
import { MessageFeedbackController, describe, type MessageFeedbackActionResult } from './controller.ts'
import { FeedbackDialogController } from './dialog.ts'

/** The per-session pair behind every entry of one Session. */
export class FeedbackSurface {
  /** The Session's message-feedback object layer, shared by every message control. */
  readonly feedback: MessageFeedbackController
  /** The Session's dialog and toast state, shared by the overlay entry and the message controls. */
  readonly dialog: FeedbackDialogController

  /**
   * @param ctx - the browser plugin context carrying both feedback Remotes.
   * @param sessionId - Session owning the transcript and the remark.
   */
  constructor(
    private readonly ctx: ClientContext,
    private readonly sessionId: SessionId,
  ) {
    this.feedback = new MessageFeedbackController(ctx.remote.messageFeedback, sessionId)
    this.dialog = new FeedbackDialogController((target, entry) =>
      target.kind === 'message' ? this.feedback.rate(target.messageId, target.rating, entry) : this.submitSession(entry),
    )
  }

  /** Submit one Session-level report through the sessionFeedback Remote. */
  private async submitSession(entry: FeedbackRecord): Promise<MessageFeedbackActionResult> {
    if (typeof this.ctx.remote.sessionFeedback.submit !== 'function')
      return { ok: false, error: { code: 'submit-unavailable', message: 'Session feedback submission is unavailable' } }
    const carried = await this.ctx.remote.sessionFeedback.submit({ sessionId: this.sessionId, description: entry.text ?? '' })
    if (!carried.ok) return { ok: false, error: { code: carried.error.code, message: carried.error.message } }
    if (carried.value.ok) return { ok: true, receipt: carried.value.value }
    return {
      ok: false,
      error: {
        code: carried.value.error.code,
        message: carried.value.error.message ?? describe(carried.value.error.code),
        ...(carried.value.error.message === undefined ? {} : { displayMessage: carried.value.error.message }),
      },
    }
  }

  /** Drop both controllers when the owning fiber unloads. */
  dispose(): void {
    this.feedback.dispose()
    this.dialog.dispose()
  }
}
