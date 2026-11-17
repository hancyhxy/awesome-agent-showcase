# Entry contract

One item is one directory. Hey Atu Market and this repository both read the same files.

```text
entries/<id>/
├── entry.json    fields below
├── body.md       item-specific body, Markdown, rules below
└── media/        stored assets, one level: media/<name>.<ext>
```

Nothing else is allowed in the directory. Symbolic links are rejected. Allowed extensions: `png`, `jpg`, `jpeg`, `webp`, `gif`, `mp4`, `webm`. Scripts, HTML and SVG stay rejected until a later contract change and code review.

## Body

`body.md` is Markdown for this item. It has no fixed layout. These rules keep it free of executable content:

- No raw HTML. Any `<` that starts a tag, comment or declaration fails. Use `[text](https://...)` for links.
- Only inline links and images are allowed: `[text](target)` and `![alt](target)`. A reference-style definition (a line with `]:`) fails.
- A link or image target is one of: a public `https` URL, an `#anchor`, or `media/<name>`. Anything else fails, for example `http:`, `data:`, `javascript:` and relative paths.
- A target has no character reference (such as `&#x73;`) and no backslash.
- A `media/<name>` target must be a stored file with a rights record.

## ID and link

- The ID has 1 to 32 lowercase letters, digits and hyphens. It matches the directory name.
- An `x-post` item uses `x-<post id>`. A `package-docs` item uses `tool-<stable name>`. The ID never comes from a title.
- The public link is `https://heyatu.com/market/<id>`, with no trailing slash.
- GitHub campaign labels: `utm_source=github`, `utm_medium=readme`, `utm_campaign=market-hero|market-grid|market-category`. The item is in the route.

## Fields of `entry.json`

| Field | Rule |
| --- | --- |
| `id` | As above |
| `title` | Text, at most 120 characters |
| `summary` | Text, at most 280 characters |
| `purposes` | One or more ids from `tags/purposes.json` |
| `source` | See below |
| `rights` | `{ "assets": [...] }`, one record for each stored file |
| `media` | `[{ "path", "alt" }]`, files used by the item |
| `prompts` | Optional, `[{ "choice", "status", "text", "label"?, "testedOn"? }]` |
| `action` | `{ "label", "prompt" }`. Required when `prompts` is not empty; not allowed without prompts. See below |
| `cover` | Optional, `{ "motion", "still" }`. See below |
| `made` | Optional, up to 3 of `[{ "path", "alt", "caption" }]`: what we made ourselves for the item. See below |
| `requirements` | List of text, may be empty |
| `tags` | Optional, `[{ "kind": "tool" or "model", "name", "version"?, "evidence" }]`. Evidence is a public https URL |
| `revision` | `sha256:<64 hex characters>` |

No other field is allowed. An approval or sign-off field does not exist. A field in `entry.json` is never proof that an item may be published: review and sign-off records stay private.

### Source

Provenance tells a public post from package documentation.

- `x-post`: `type`, `url` (`https://x.com/<handle>/status/<id>`), `author`, `credit`, `publishedAt`, `capturedAt`. Optional `video`: the MP4 file of the post video, `https://video.twimg.com/<path>.mp4` with at most a `?tag=<number>` query. The page plays it from X when the reader presses play, so choose a variant of at most 720p. No other host is allowed.
- `package-docs`: `type`, `url`, `package`, `credit`, `capturedAt`.

Dates are `YYYY-MM-DD`. The credit is shown publicly. Two items cannot share a source: an `x-post` source key is `x:<post id>`, a `package-docs` key is `docs:<host><path>`.

### Rights

One record for each stored file. A stored file without a record fails. A record without a file fails.

| `basis` | Other fields |
| --- | --- |
| `original` | none; covered by `LICENSE-CONTENT` |
| `licensed` | `holder`, `licence`, `licenceUrl` |
| `permission` | `holder`, `grantedOn` |
| `quoted` | `holder`, `sourceUrl`, `excerpt` |

A `quoted` record is a short excerpt of the media of the item's own source post, shown with credit and a link. These rules apply, and each failure rejects the entry:

- Only an `x-post` item may use it.
- `holder` is the handle in `source.author`, without `@`.
- `sourceUrl` equals `source.url`.
- `excerpt` is text of at most 200 characters that says which part is quoted, for example `0:16-0:20 of the post video`.
- The file is a `gif`, `webp` or `mp4`, at most 8 seconds and at most 2 MB. The validator reads the length from the file: the frame delays of a GIF or an animated WebP, and the movie header of an MP4. A file whose length cannot be read fails. A still image has no length and passes.
- A cover that uses a quoted file shows "via @handle" (the README block, Market cards and wall tiles). A quoted file stays the author's work: [THIRD-PARTY.md](../THIRD-PARTY.md#quoted-excerpts) says how to ask for its removal.

### Prompts

`choice` is a stable ID such as `paper-garden`. It is unique in the item. `status` is separate: `original` (the source's own text), `proposed` (written by us, not run) or `tested` (run, needs `testedOn`). The prompt that `action.prompt` names is the one that Hey Atu puts in a new chat.

### Action

`action` is the main button of the item page: `label` is text of at most 40 characters (for example `Make a sticker in Atu`). `prompt` is the `choice` of one entry of `prompts`. Hey Atu opens a new chat with that prompt as a draft; it never sends it. The item page and the README never show the prompt text.

### Made

`made` lists pictures or short animations that we made ourselves to show the result of the item. Market shows each one as a gallery panel **Made in Atu**, after the video. `path` is `media/<name>` as `png`, `jpg`, `jpeg`, `webp`, `gif` or `mp4`, at most 2 MB. Its rights record has the basis `original`: a made file is never a quoted or a licensed file. `alt` is at most 300 characters. `caption` is at most 160 characters and says plainly what the file is, for example "Our pixel take on the theme; not a screenshot of Claude Code". A made file never imitates a screenshot of a product and never carries the logo of another party. Each file needs a stored file and the same checks as other media.

### Cover

`cover` is the picture that a card or a wall tile shows: `motion` is `media/<name>` as `gif`, `webp` or `mp4`; `still` is `media/<name>` as `png`, `jpg`, `jpeg` or `webp`. A reader who asks for less motion sees the still. The two files are different. Each file needs a rights record, a stored file and the same checks as other media. The README block shows the GIF cover when `motion` is a GIF, and the still in all other cases.

## Revision

The revision binds the public content and the asset bytes. It is the only revision identity: a short display label is not a second approval.

1. Take `entry.json` without its `revision` field. Write it as canonical JSON: object keys sorted by UTF-16 code unit, no white space, `JSON.stringify` for strings and numbers.
2. For `entry.json` (this canonical text), `body.md` and every file in `media/`, make the line `<sha256 hex of the bytes>  <name>\n`.
3. Sort the lines by name. Join them. The revision is `sha256:` and the SHA-256 hex of that text.

`node scripts/validate.mjs --revision <id>` prints the computed value. Validation fails when `revision` differs from it.

## Deployment record

`deployments.json` holds records of released items. It does not exist until the first release. A record has exactly:

```json
{ "id": "...", "revision": "sha256:...", "url": "https://heyatu.com/market/<id>", "release": "<verified release reference>" }
```

- `release` is a reference such as a commit SHA. It is not a path.
- A record names an existing item. There is one record for each item.
- A README link exists only for an item with a record. The link stays when a new draft revision differs from the released one, until a new record replaces it.
- Nothing in this repository publishes or verifies a release. A person writes the record after the release check.

## Checks

`node scripts/validate.mjs` runs the rules above, checks deployment records and scans the tree for credentials, machine paths, session data and private exports. `--history` scans all commits. `node scripts/readme.mjs --check` fails when the generated README block is stale.
