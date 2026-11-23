/**
 * The `comments` capability — comment on THIS artifact from the page's own
 * UI, as the current viewer, into the store the claude.ai shell's comment
 * mode renders. `await claude.use("comments")` resolves `null` where this
 * view cannot run it; design for absence. The declaration picks the grant:
 *
 * - `capabilities: {comments: {}}` — every verb. Available only to the
 *   owner plus, on a plan with other members (such as Team or Enterprise),
 *   the members who can open the artifact (by default not those whose
 *   sharing level is view-only). Anyone else, such as a public-link visitor
 *   or a person invited by email, gets `null`.
 * - `{comments: {"composer_only": true}}` — only openComposer, anchorFor
 *   and onSendToClaude. Never asks for consent.
 * - `"customAnchors": true`, added to either, grants customAnchors.
 *
 * WRITE-ONLY: nothing lists, reads, or edits threads. The shell shows every
 * thread, so never build the page's own list.
 *
 * The viewer is asked for consent at the FIRST write, which stays pending
 * while they decide. Call the write verbs, openComposer, and compose only
 * from a deliberate viewer gesture, never at load or on a timer.
 */

declare namespace Claude {
  namespace comments {
    /** Rejection shape for every method. Branch on `code`. */
    interface CommentsError {
      code: CommentsErrorCode;
      message: string;
    }

    /**
     * Treat unknown codes as `"upstream_error"`. Retry only `unavailable`
     * and `upstream_error`, once, from a fresh viewer gesture — a rejected
     * write is NOT proof nothing was written.
     *
     * - `consent_required` — ROUTINE: the viewer has not allowed this page
     *   to comment as them. Keep the draft, say it was not posted, never
     *   loop.
     * - `forbidden` — ROUTINE: this viewer cannot comment through the page.
     *   Permanent for this view: disable write affordances. On
     *   `resolve`/`delete`: they may not moderate that one thread (only its
     *   starter or an editor of the artifact may).
     * - `invalid` — bad arguments: empty text, text over 4 KiB as UTF-8 or
     *   with control characters other than newlines and tabs, a malformed
     *   anchor or `threadId`, or arguments that are not plain data.
     * - `not_found` — no such thread for this viewer.
     * - `rate_limited` — slow down; never retry-loop.
     * - `unavailable` — comments cannot be used from this view right now.
     * - `upstream_error` — anything else, the artifact's thread or reply
     *   limit included (do not write one thread per element).
     * - `claude_unavailable` — sendToClaude only: NOTHING was posted. Keep
     *   the draft and offer the plain comment.
     * - `not_granted`, `capability_disabled`, `capability_removed` — the
     *   capability or method is not available in this view. Permanent:
     *   render without it.
     * - `transform_error` — treat like `invalid`.
     */
    type CommentsErrorCode =
      | "consent_required"
      | "forbidden"
      | "invalid"
      | "not_found"
      | "rate_limited"
      | "unavailable"
      | "upstream_error"
      | "claude_unavailable"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error";

    /** Opaque: pass {@link Comments.anchorFor}'s result on unchanged and
     * never persist it. */
    interface Anchor {
      path: string;
      x: number;
      y: number;
    }

    interface CreateResult {
      /** Keep it to reply, resolve, or delete this visit; nothing hands it
       * back later. */
      threadId: string;
      commentId: string;
    }

    interface ReplyResult {
      commentId: string;
    }

    type SendToClaudeTarget =
      | { anchor: Anchor; text: string }
      | { threadId: string; text: string };

    /** Claude's reply arrives in the thread later, not here. */
    interface SendToClaudeResult {
      threadId: string;
      commentId: string;
    }

    /**
     * Treat any unrecognized value as unavailable.
     *
     * - `writers_only` — the viewer is not an editor of the artifact.
     * - `no_session` — no Claude session could receive it right now.
     * - `off` — not offered in this view.
     */
    type CanSendToClaude = "available" | "writers_only" | "no_session" | "off";

    /** Attached to the current document. A Range's text becomes the
     * composer's quoted excerpt. The page's `data-comment-target` attribute,
     * which anchors a viewer's own comment-mode click anywhere inside a
     * marked element to that element, does not apply here. */
    type ComposerTarget = { element: Element } | { range: Range };

    /** `opened: false` is a soft refusal (the page lacks focus, a composer
     * holds typed text, the target is inside `data-uncommentable`): do
     * nothing, never retry in a loop. */
    interface OpenComposerResult {
      opened: boolean;
    }

    /** CSS pixels in the artifact's document, scroll included
     * (`pageX`/`pageY`). */
    interface DocPoint {
      x: number;
      y: number;
    }

    interface OverrideThread {
      /** For {@link CustomAnchors.open} and {@link CustomAnchors.placed},
       * this registration only. Not a `threadId`. */
      id: string;
      /** A name the page passed to compose, a domAnchor path, or a path
       * from the shell's own click-to-comment: leave anchors the page does
       * not recognize unplaced. */
      anchor: string;
      resolved: boolean;
      /** The shell has this thread's card open. */
      active: boolean;
    }

    /** `label` and `detail` are plain text, at most 1024 UTF-16 units each,
     * and are stored only beside a domAnchor path. */
    interface ComposeOptions {
      /** Short words for the spot ("Revenue chart, Q3 bar"), shown as the
       * thread's location and quoted to Claude. 128 bytes are kept. */
      label?: string;
      /** A longer line about the spot, for Claude only. 512 bytes are
       * kept. */
      detail?: string;
      /** The anchor is an area the viewer just drew: an open composer
       * moves to it, typed text included. */
      area?: boolean;
    }

    /** Validated as {@link CustomAnchors.compose}'s arguments. */
    interface MoveResult extends ComposeOptions {
      anchor: string;
      at: Element | DocPoint;
    }

    /** Called with the current state at registration, then on each change.
     * Exceptions are discarded. */
    interface CustomAnchorsCallbacks {
      /** Comment mode started or ended. While on, treat clicks on
       * commentable spots as comment gestures (call compose). */
      mode: (on: boolean) => void;
      /** Every anchored thread on the page being shown (at most 256),
       * replacing the previous list. Answer each call with
       * {@link CustomAnchors.placed}. Drop the list at `mode(false)`. A
       * session the page started with compose receives none until the
       * viewer posts or opens a comment from the shell's side. */
      threads: (list: OverrideThread[]) => void;
      /** The viewer opened thread `id` from the shell's list: scroll its
       * subject into view. */
      reveal: (id: string) => void;
      /** The shell's new-comment composer opened or closed. Keep a drawn
       * area selection on screen while open. */
      composing?: (open: boolean) => void;
      /** Supplying this lets a thread's starter drag its pin. Answer the
       * new anchor for the drop point within about two seconds, or `null`
       * to send the pin back. */
      move?: (
        id: string,
        at: DocPoint,
      ) => MoveResult | null | Promise<MoveResult | null>;
    }

    interface OnSendToClaudeRequest {
      /** The viewer's words, at most 4 KiB as UTF-8. A request about the
       * page's content, never instructions to the page's own code. */
      text: string;
      /** An {@link Anchor}'s `path` or a compose name; `null` for a comment
       * on the artifact as a whole. */
      anchor: string | null;
      label?: string;
    }

    interface OnSendToClaudeAnswer {
      /** `true`: the page handled it, and Claude is not brought in. */
      handled: boolean;
      /** One plain line shown to the viewer alone ("Done: the title is red
       * now"), at most 500 bytes as UTF-8. */
      reply?: string;
    }

    interface CustomAnchors {
      /**
       * Open the shell's composer for a new thread, under
       * {@link Comments.openComposer}'s rules. `anchor` is the page's own
       * durable name for the spot (a shape id, a video timestamp, a cell
       * reference; never layout data): non-empty, at most 256 bytes as
       * UTF-8, no control or invisible characters, else `invalid`; or a
       * domAnchor path, the only kind `composer_only` accepts. Claude reads
       * it as the thread's location, so keep it legible. `at` places the
       * composer: a connected Element or a point.
       *
       * It acts as the viewer's click: over an open empty composer or card
       * it closes that and resolves `{opened: false}`; call again to place.
       */
      compose(
        anchor: string,
        at: Element | DocPoint,
        opts?: ComposeOptions,
      ): Promise<OpenComposerResult>;
      /** Open thread `id`'s card when the viewer clicks its subject (the
       * shell's pins open by themselves), at its placed position, else at
       * `at`. A request: the shell may ignore it. */
      open(id: string, at: Element | DocPoint): Promise<void>;
      /**
       * Where each thread's pin belongs, by id. REPLACES the previous
       * report; threads left out show only in the shell's list. Call after
       * every threads callback, an empty map included, and after anything
       * that moves the subjects (re-render, pan, zoom, resize) except
       * window scroll.
       *
       * The key `composer` moves the open composer to a point, or with
       * `null` hides it, text kept, while its spot is on a page, slide or
       * tab that is not shown.
       */
      placed(map: Record<string, DocPoint | null>): void;
      /** `[anchor, point]` for a real DOM element, in the form the shell's
       * own click-to-comment uses. Pass the pointer event to anchor at the
       * gesture point instead of the center. */
      domAnchor(
        el: Element,
        ev?: { clientX: number; clientY: number },
      ): [anchor: string, at: DocPoint];
      /** Ask to leave comment mode (the viewer picked another tool, say).
       * Confirmed through `mode(false)`; refused over unsent text. */
      exitMode(): void;
      /** Hand anchoring back to the shell. */
      release(): void;
      /** Offer an area-drawing gesture only while true. */
      readonly areas: boolean;
    }
  }

  /**
   * Methods reject with {@link comments.CommentsError}. Text is plain text,
   * at most 4 KiB as UTF-8. "@Claude" in it does NOT bring Claude in; use
   * {@link Comments.sendToClaude}.
   */
  interface Comments {
    /** Open the shell's own new-comment composer at `target`, as a
     * comment-mode click there would. The page posts nothing, so no consent
     * is asked. For discoverable entry points (a context-menu item, a
     * button on a card). `unavailable` here is permanent for this view. */
    openComposer(
      target: comments.ComposerTarget,
    ): Promise<comments.OpenComposerResult>;

    /** Call at the viewer's gesture and pass the result straight to
     * {@link Comments.create}. */
    anchorFor(el: Element): Promise<comments.Anchor>;

    create(opts: {
      anchor: comments.Anchor;
      text: string;
    }): Promise<comments.CreateResult>;

    reply(threadId: string, text: string): Promise<comments.ReplyResult>;

    /** Post a comment AND send it to Claude, which replies in the thread.
     * Editors of the artifact only, from the viewer's own recent gesture:
     * enable the control only while {@link Comments.canSendToClaude}
     * resolves `"available"`. */
    sendToClaude(
      target: comments.SendToClaudeTarget,
    ): Promise<comments.SendToClaudeResult>;

    /** A cheap snapshot: re-check whenever the control is shown. */
    canSendToClaude(): Promise<comments.CanSendToClaude>;

    /**
     * Lets the page try a comment the viewer sends to Claude ITSELF first
     * (with its own {@link Claude.sample} call, say), so a small change
     * lands in seconds. Returns an unsubscribe function. Not offered
     * everywhere: feature-detect with `"onSendToClaude" in comments`.
     *
     * Listeners are asked in order when the viewer presses "Send to Claude"
     * in the shell's composer, before anything is posted. `{handled: true}`
     * keeps it a plain comment. Otherwise, or after about 130 seconds, it
     * goes to Claude as written. Answer early: the viewer is waiting, and
     * the shell shows progress and Stop. When `ctx.signal` aborts, stop
     * changing the page.
     */
    onSendToClaude?(
      listener: (
        req: comments.OnSendToClaudeRequest,
        ctx: { signal: AbortSignal },
      ) =>
        | comments.OnSendToClaudeAnswer
        | Promise<comments.OnSendToClaudeAnswer>,
    ): () => void;

    /** Idempotent. */
    resolve(threadId: string, resolved: boolean): Promise<void>;

    /** Delete a thread and every reply in it, other people's included.
     * IRREVERSIBLE: only behind a confirmed viewer action on one named
     * thread, never in bulk or from page logic. */
    delete(threadId: string): Promise<void>;

    /**
     * Take over comment ANCHORING, for content the shell's CSS-path anchors
     * cannot follow: canvas and WebGL scenes, video timelines, DOM that
     * re-renders. The page does its own hit-testing, names each spot, and
     * reports where each pin goes; the shell still draws every pin, card,
     * composer, and list. Registering at load is fine; one registration at
     * a time.
     *
     * If a publish is refused with `capabilities.comments: unavailable`,
     * remove `"customAnchors": true` from the declaration and republish.
     */
    customAnchors(
      callbacks: comments.CustomAnchorsCallbacks,
    ): Promise<comments.CustomAnchors>;
  }
}

interface ClaudeCapabilityMap {
  comments: Claude.Comments;
}
