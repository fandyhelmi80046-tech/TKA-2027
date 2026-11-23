/**
 * The `artifact` capability — this artifact, and the titles of other
 * artifacts whose ids or links it holds.
 *
 * Artifact publish: this page writes to ITSELF by publishing a new version
 * (`publish`).
 *
 * The page hands the shell a complete replacement `index.html` — or, on a
 * multi-file artifact, just the files that changed — and the shell
 * publishes it as a new immutable version of the same artifact with the
 * viewer's own authority; every open view live-reloads to it (a files
 * publish leaves the publishing view running — see {@link publish}). Obtain
 * the namespace with `await claude.use("artifact")` — `null` means this view
 * cannot run the capability; a read-only view still resolves the
 * namespace, and its write verbs surface as rejection codes
 * (`not_granted` / `not_writer`; `sync` as below), never as `null`.
 *
 * Declaring `{artifact: {publish: false}}` stops the page from saving
 * itself: for every viewer, writers included, `publish`, `edit` and
 * `sync` reject `not_granted`. Claude and the artifact's editors can still
 * publish new versions the usual way. `metadata` works the same under
 * either declaration.
 */

declare namespace Claude {
  /**
   * Failure design — read before writing any call site. A publish is a
   * write with real preconditions, and two of its failures are ROUTINE:
   *
   * - `conflict` — someone else (another viewer, or the author's own
   *   editing session) published between this page's load and this call.
   *   This is not an error state to apologize for: the shell is already
   *   reloading every open view to the winning version, so the correct
   *   handling is almost always to do nothing beyond aborting local
   *   optimistic UI — the reload delivers the new truth. If the page
   *   holds unsent viewer input worth preserving across that reload,
   *   stash it in `sessionStorage` before calling `publish` (state kept
   *   only in JS variables does not survive the reload). With `ifMatch`
   *   on a files publish, the `conflict` can have `paths` to merge from.
   * - `not_writer` — this viewer can see the page but cannot write it.
   *   Member presence does NOT signal writability (see the member doc),
   *   so a shared page should treat its first `not_writer` or
   *   `not_granted` rejection as the read-only signal: disable or hide
   *   write affordances from then on, with copy that says the view is
   *   read-only rather than that something failed.
   *
   * The rest are exceptional: branch the UX on the error `code`, never
   * on message text; retry only `upstream_error`, at most once after a
   * short randomized delay; treat `rate_limited` as a signal to slow the
   * page's own cadence (batch several changes into one publish), never
   * to retry-loop.
   */
  namespace artifact {
    /**
     * Rejection shape for {@link publish}. Branch on `.code`;
     * `.message` is human-readable but not localized.
     */
    interface ArtifactError {
      code: ArtifactErrorCode;
      message: string;
      /** On `conflict`: the version identifier that is now live. */
      live?: string;
      /** On a files `conflict`: the files whose `ifMatch` no longer held. */
      paths?: ConflictPath[];
      /** On a files `conflict`: as {@link PublishResult.changed}. */
      changed?: ChangedFile[];
      /** May be present on `invalid_content` when the artifact would hold too
       * many files (`kind: "files"`): a publish must leave it with at most
       * `max` files in all, counting the ones it does not touch. Ignore a
       * `kind` you do not know. */
      limit?: { kind: "files"; max: number };
    }

    /** A file that changed; `sha256` is its hash now, `null` if deleted. */
    interface ChangedFile {
      path: string;
      sha256: string | null;
    }

    /** `expected`: the `ifMatch` sent; `actual`: the file's sha256 now
     * (`null`: no such file). */
    interface ConflictPath {
      path: string;
      expected: string | null;
      actual: string | null;
    }

    /**
     * Stable error codes. Treat unknown codes as `"upstream_error"` —
     * but note the lifecycle codes below are PERMANENT for the view:
     * never retry them.
     *
     * - `conflict` — a newer version was published first; the view is
     *   already being reloaded to it. See the failure-design note above.
     * - `not_writer` — the viewer lacks write access to this artifact.
     * - `not_declared` — the artifact no longer declares this capability
     *   (a republish dropped it). Hide write affordances.
     * - `too_large` — the submitted HTML, or the submitted files
     *   together, exceed the size limit.
     * - `invalid_content` — the submitted string is not an HTML page
     *   (it must begin with a doctype, like the page itself does), or a
     *   files argument is malformed (a path, content, or content type the
     *   artifact cannot store), or the publish would leave the artifact
     *   with more files than it may hold (see `limit`).
     * - `read_only_path` — on an artifact made from a TYPE (it keeps the
     *   type's page and files read-only; only its own files can change):
     *   a files publish named one of the type's paths — nothing was
     *   published; drop that path and publish the rest — or an `html`
     *   publish was attempted, which such an artifact never accepts; use
     *   the files form.
     * - `rate_limited` — publishing too often; slow down and batch.
     * - `consent_required` — legacy code from shells that gated
     *   artifact publish on a per-viewer consent prompt; current shells
     *   never send it (the grant is by construction). Treat
     *   like `not_granted`: render the read-only experience.
     * - `upstream_error` — anything else (transient service failure).
     *
     * Lifecycle codes (from the runtime itself, not the publish path) —
     * permanent for this view, never retryable:
     * - `not_granted` — the viewer's session did not grant this verb to this
     *   frame (undeclared artifact, a declaration with `publish: false`, or
     *   a read-only view); render the read-only experience.
     * - `capability_disabled` — granted but not usable in this view
     *   (the serving runtime predates it, or its module failed to
     *   load), or — for the files form of {@link publish} — the form is
     *   not available to this view or this artifact; treat like
     *   `not_granted`.
     * - `capability_removed` — the called method is not part of the
     *   runtime serving this view; treat like `capability_disabled`.
     * - `transform_error` — the call's arguments could not be prepared;
     *   treat like `invalid_content`.
     */
    type ArtifactErrorCode =
      | "conflict"
      | "not_writer"
      | "not_declared"
      | "too_large"
      | "invalid_content"
      | "read_only_path"
      | "rate_limited"
      | "consent_required"
      | "upstream_error"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error";

    /** Resolution shape for {@link publish}. */
    interface PublishResult {
      /** The new version's identifier — informational; the shell reloads
       * every open view to it (after an `html` publish this one too; after
       * a files publish this view keeps running and builds on it, unless
       * the save landed over someone else's). */
      version: string;
      /** When every entry had `ifMatch`: files other writers changed since
       * this view's version (`[]`: none; absent: unknown). This view's move
       * to the new version brings their content. */
      changed?: ChangedFile[];
      /** Present when the host checked this call's `ifMatch` values (any
       * entry had one; `null` counts); a call with none gets no `shas`. Maps
       * every file this call wrote to its stored sha256: use that as the
       * file's next `ifMatch`, not a hash of what you sent. `{}` when the
       * call wrote no file, so test `shas !== undefined`. */
      shas?: Record<string, string>;
    }

    /**
     * One file in a files publish: UTF-8 text as a string, binary bytes
     * as a `Blob`, or either wrapped as `{content, contentType}` to state
     * the media type explicitly (a bare type such as `text/plain`, no
     * `;charset` parameters; a string needs a text type, anything else
     * goes as a `Blob`). Without `contentType` the type is the
     * Blob's own `type`, else inferred from the path's extension for the
     * common web types (html, htm, css, js, mjs, json, webmanifest, txt,
     * md, xml, svg, png, jpg, jpeg, gif, webp, avif, ico, woff, woff2,
     * ttf, otf, mp3, wav, mp4, webm, pdf, wasm); any other name needs an
     * explicit `contentType`, and the artifact stores only servable web
     * media types. `ifMatch`: the sha256 of the copy this write replaces
     * (`null`: creating it); see PER-FILE PRECONDITIONS on {@link publish}.
     */
    type PublishFile =
      | string
      | Blob
      | {
          content: string | Blob;
          contentType?: string;
          ifMatch?: string | null;
        };

    /** Delete the file; with `ifMatch`, only while its sha256 is still that. */
    type PublishDelete = { delete: true; ifMatch?: string };

    /**
     * Publish `html` as the new live version of this artifact.
     *
     * `html` must be the COMPLETE replacement page — a full document
     * starting with `<!doctype html>`, exactly what a fresh viewer should
     * receive. Do not serialize the live DOM (`document.documentElement.
     * outerHTML` contains viewer-session state and injected runtime
     * scripts); instead, keep the page's canonical source in JS — for
     * example a template function of the page's state — and render the
     * replacement from that, the same way the page was authored.
     *
     * The write is compare-and-set against the version this view is
     * running: if anything published in between, the call rejects with
     * `conflict` and the view reloads to the winner. After a successful
     * publish this view reloads too — treat `publish` as the last act of
     * an interaction, and stash anything that must survive in
     * `sessionStorage` first.
     *
     * Publishing runs with the VIEWER's authority and identity: on a
     * shared artifact where other people can write, each viewer's click
     * publishes as them. Every version is attributed and the full page
     * is replaced atomically — there is no partial update.
     */
    function publish(html: string): Promise<PublishResult>;

    /**
     * FILES FORM — publish just the files that changed as the new live
     * version: `files` maps relative paths (`"data/doc.json"`,
     * `"notes.md"`) to their new content, or to `null` to delete the
     * path; every path not named is carried over unchanged. This is the
     * save path for editor-style artifacts whose page stays fixed while
     * its data files change — including an artifact made from a TYPE,
     * whose page (`index.html`) and other type files are read-only:
     * naming one rejects `read_only_path` and publishes nothing, and the
     * `html` form is refused there outright.
     *
     * Same viewer authority and `not_writer` design as the `html` form, and
     * by default the same compare-and-set on the whole version. On success
     * THIS view keeps running (unless the save landed over someone else's,
     * below): its next publish builds on the version it just made, and only
     * the OTHER open views reload. Relative URLs in this view still serve
     * the version it loaded, so render saved content from the data the page
     * holds. Every call mints a full version, so never publish per
     * keystroke: debounce edits into one call, with all changed files, a few
     * seconds after the user pauses (or on an explicit Save). Where the form
     * is not available — the view's host does not enable it (a read-only
     * view included), or the artifact is shared publicly — the call rejects
     * `capability_disabled`: keep the user's work in the page and say saving
     * is unavailable here.
     *
     * PER-FILE PRECONDITIONS — when others may save the same artifact, give
     * each entry `ifMatch`: the file's sha256 as the host last reported it
     * (file listing, a result's `shas`, a `conflict`'s `actual`); `null`
     * when creating; `{delete: true, ifMatch}` to delete. With one on every
     * entry (one entry without it keeps the whole-version check for the
     * call), two writers' saves to different files both land, and a save
     * that landed over someone else's moves this view to the new version: a
     * RELOAD unless the page takes updates in place. If a named file
     * changed, nothing is published and the `conflict` has `paths`: once
     * this view has moved to the live version, re-read those files, merge,
     * publish again.
     */
    function publish(
      files: Record<string, PublishFile | PublishDelete | null>,
    ): Promise<PublishResult>;

    /**
     * @deprecated Saves nothing and always rejects (`not_writer` or
     * `not_granted`): a live doc cannot be changed from its page. Use
     * `publish` on other artifacts.
     */
    function edit(ops: unknown[]): Promise<never>;

    /**
     * @deprecated Runs `fn` (which may be async) and saves nothing. On a live
     * doc, or on a page with an `<artifact-sync>` element or `artifact-sync`
     * attribute, it rejects `invalid_content` once `fn` has run, so it never
     * reads as saved. The `<artifact-sync>` and `<artifact-local>` elements
     * take no box of their own (`display: contents`).
     */
    function sync(fn: () => unknown): Promise<void>;

    /** One answer from {@link metadata}. */
    interface ArtifactMetadata {
      /** The artifact's id as a lowercase 36-character uuid, whichever form
       *  the input used; "" when the input named no artifact. */
      id: string;
      /** Its current title; "" when there is none for this viewer here. */
      title: string;
      /** A short word for what kind of artifact it is, as the platform names it;
       *  null when it has none or it is not known. Treat a word you don't know as null. */
      type: string | null;
    }

    /**
     * Current titles and kinds of other artifacts, for link chips the page
     * draws. Use it only when the page must show an artifact's current
     * title: a page that just links, or labels its links with the person's
     * own words, needs neither `metadata()` nor `{artifact: {publish: false}}`.
     * Pass ids or links, up to 200 distinct artifacts per call; you
     * get one entry per input, keyed by the input as given. An input may be
     * an artifact id (the 36-character uuid, any case, or the 22-character
     * id) or an http(s) link whose path ends in /artifact/ and then the id,
     * optionally after a title and a hyphen. Only that id is read, never the
     * link's host, so a title does not show where a link goes.
     *
     * Answers differ per viewer. Show them to this viewer only: keep what
     * `metadata()` returns out of the published page, stored data, a room,
     * comments and anything sent off the page.
     * Keep answers in memory for this view and ask
     * again on load and when the page's links change. Set titles with
     * textContent; they are other people's text.
     *
     * On a runtime that has `metadata()` it never rejects. Where the serving
     * runtime predates it, calling it throws a TypeError or rejects
     * `capability_removed`: once
     * `const artifact = await claude.use("artifact")` has given a non-null
     * `artifact`, call it only if `"metadata" in artifact`. An empty title
     * means there is no title for this viewer here, for any reason: show a
     * plain link, never "no access".
     */
    function metadata(
      refs: readonly string[],
    ): Promise<Record<string, ArtifactMetadata>>;
  }
}

interface ClaudeCapabilityMap {
  artifact: typeof Claude.artifact;
  /** Legacy spelling — `claude.use("self")` resolves the same namespace. */
  self: typeof Claude.artifact;
}
