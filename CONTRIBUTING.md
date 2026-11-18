# Contributing

Suggest a public post with the [suggestion form](https://github.com/heyatu/awesome-agent-showcase/issues/new?template=suggest-a-post.yml). Open an issue for a correction, a missing credit or a rights concern. A pull request is welcome for a fix to existing text.

## What a change needs

- Edit one item at a time. An item is the directory `entries/<id>/`. Its fields and files are in [docs/entry-contract.md](docs/entry-contract.md).
- Do not copy third-party text or media into an item without a rights record. Link to the source when you cannot show that you may reuse it. A short excerpt of the media of the source post itself may use the `quoted` basis ([THIRD-PARTY.md](THIRD-PARTY.md#quoted-excerpts)).
- Do not add a tool, model or version tag without a public URL that supports it.
- Mark a prompt `tested` only when you ran it. Use `proposed` for a prompt that you wrote and did not run.
- Do not add executable files, scripts, HTML (except the reviewed self-contained `made` page), SVG, exports, logs, credentials or machine paths.
- Give an item that has prompts an `action`. Give both files of a `cover` a rights record.
- Update the `revision` of an item after every content or asset change. Run `node scripts/validate.mjs --revision <id>` to see the computed value. Then run `node scripts/readme.mjs`.
- Run `node scripts/validate.mjs`, `node scripts/readme.mjs --check` and `node --test "test/*.test.mjs"` before you open a pull request.

## Review and publication

A suggestion is a request, not an item. A maintainer reviews every suggestion, and we may decline it.

A passing check is not approval. A maintainer reviews every item and every change to an item. A new revision needs a new review. Merging a pull request does not publish an item to Hey Atu Market: a separate, reviewed release does that, and nothing publishes automatically.

You cannot skip review by editing `revision`, a link or any other field. An item has no approval field.

## Licensing

By contributing original text or assets, you agree to release them under the licences in [README.md](README.md#sources-and-rights): MIT for code and CC BY 4.0 for text and assets. Third-party work keeps its own terms.
