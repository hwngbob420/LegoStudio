# Accepting and reading uploaded outline/story documents in a local Node.js + Express 5 (TypeScript, ESM, Windows) app, and handing the text to Claude

Context checked locally (read-only): `apps/server/package.json` is ESM (`"type": "module"`), already pins `express` 5.3.0, `zod` ^4, `@google/genai` 3.6.1, and has no upload or document-parsing packages yet. The machine runs Node v24.12.0. `apps/server/src/ai/sessionQueue.ts` already implements the file-based "Claude mailbox" (`AI_SESSION_QUEUE`). Project rule (CLAUDE.md): no npm packages outside `docs/MASTER_ADD.md` section 3 without asking the user, so every package below needs user approval before it is added.

Version/licence data below was pulled from the npm registry on 2026-11-26 (`npm view <pkg> version license time engines`), and advisory data from the npm bulk advisory endpoint (`POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`, which returns GitHub Advisory Database entries). The GitHub REST advisory API was rate-limited, so GHSA links below come from the npm endpoint's `url` fields.

## Upload middleware for Express 5 (multer v2, busboy, formidable): versions, compatibility, 2025-2026 advisories

### Takeaway
Use `multer` 2.5.0 (MIT, maintained in the `expressjs` org, released 2026-10-22). Every older 2.x release has at least one High DoS advisory, so pin exactly 2.5.0 or later, use a synchronous `fileFilter`, set explicit `limits`, and mount it only on the upload route. busboy (multer's parser) has not had a release since 2022. formidable 3.5.4 works but its 4.x line has sat at release candidates since May 2025.

### Cited Findings
- multer latest = 2.5.0, MIT, repo `github.com/expressjs/multer`, engines `node >= 10.16.0`. Recent releases: 2.2.0 (2026-06-15), 2.3.0 (2026-08-28), 2.4.0 (2026-09-14), 2.5.0 (2026-10-22). Dependencies: `busboy ^1.6.0`, `type-is ^1.6.18`, `append-field ^1.0.0`. — [npm: multer](https://www.npmjs.com/package/multer)
- multer advisories (all fixed by 2.5.0), from the npm bulk advisory endpoint:
  - High, <2.0.1: DoS via unhandled exception — [GHSA-g5hg-p3ph-g8qg](https://github.com/advisories/GHSA-g5hg-p3ph-g8qg)
  - High, <2.0.2: DoS via unhandled exception from malformed request — [GHSA-fjgf-rc76-4x9p](https://github.com/advisories/GHSA-fjgf-rc76-4x9p)
  - High, <2.1.0: DoS via incomplete cleanup — [GHSA-xf7r-hgr6-v32p](https://github.com/advisories/GHSA-xf7r-hgr6-v32p)
  - High, <2.1.0: DoS via resource exhaustion (dropped connection during upload) — [GHSA-v52c-386h-88mc](https://github.com/advisories/GHSA-v52c-386h-88mc)
  - High, <2.1.1: DoS via uncontrolled recursion — [GHSA-5528-5vmv-3xc2](https://github.com/advisories/GHSA-5528-5vmv-3xc2)
  - High, <2.2.0: DoS via deeply nested field names — [GHSA-72gw-mp4g-v24j](https://github.com/advisories/GHSA-72gw-mp4g-v24j)
  - Moderate, <2.2.0: orphaned partial files on aborted uploads with diskStorage — [GHSA-3p4h-7m6x-2hcm](https://github.com/advisories/GHSA-3p4h-7m6x-2hcm)
  - High, <2.3.0: DoS via crafted multipart field names — [GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm)
  - Low, <2.3.0: file size limit bypass via async fileFilter race — [GHSA-qvfw-j98x-7q72](https://github.com/advisories/GHSA-qvfw-j98x-7q72)
  - High, <2.3.0: DoS via oversized array index in field names — [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4)
  - High, >=2.0.0 <2.5.0: DoS via a pending asynchronous fileFilter after request teardown — [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m)
  - Querying the endpoint with multer 2.5.0 returned no advisories. — [npm bulk advisory endpoint](https://registry.npmjs.org/-/npm/v1/security/advisories/bulk)
- Express published security-release posts covering multer on 2026-02-27 and 2026-06-30. The June post covers multer 2.2.0 (nested field names DoS; orphaned files on aborted uploads). — [Express blog 2026-02-27](https://expressjs.com/en/blog/2026-02-27-security-releases); [Express blog 2026-06-30](https://expressjs.com/fr/blog/2026-06-30-security-releases)
- The search engine summary also gave CVE IDs for these (e.g. CVE-2026-2359, CVE-2026-5079, CVE-2026-5038, CVE-2026-77078, CVE-2026-88932, CVE-2026-113872). Some of these numbers look unusual and could not be checked against NVD, so cite the GHSA IDs instead. One summary mentioned an orphaned-file fix in 2.4.0 (GHSA-3pph-fpjx-jg34) that the npm endpoint did not list. — [GitLab advisory CVE-2026-88932](https://advisories.gitlab.com/npm/multer/CVE-2026-88932/)
- multer `limits` options and defaults: `fieldNameSize` (Infinity), `fieldSize` (1MB), `fields` (Infinity), `fileSize` (Infinity), `files` (Infinity), `parts` (Infinity), `headerPairs` (2000), `fieldNestingDepth` (Infinity), `fieldArrayIndexLimit` (Infinity). `limits` can also be a per-request function. Limits apply to the whole request, not to each file. — [multer README](https://github.com/expressjs/multer)
- multer MemoryStorage keeps files in `file.buffer` and can run the app out of memory. DiskStorage takes `destination`, `filename`, `flush`, and does not add file extensions. `file.originalname` is client-supplied and not sanitized. The README says to "Never add multer as a global middleware". Errors are `multer.MulterError` with codes such as `LIMIT_FILE_SIZE` and `LIMIT_UNEXPECTED_FILE`. — [multer README](https://github.com/expressjs/multer)
- busboy latest = 1.6.0, released 2022-04-19 (no release since), engines `>=10.16.0`. npm shows no licence field in the version metadata. — [npm: busboy](https://www.npmjs.com/package/busboy)
- formidable latest stable = 3.5.4, MIT, ESM (`type: module`), engines `>=14`. The 4.0.0 line stopped at 4.0.0-rc.6 (2025-05-12). Low advisory for <3.5.3 (filename guessing, hexoid) — [npm: formidable](https://www.npmjs.com/package/formidable); [GHSA-75v8-2h7p-7m2m](https://github.com/advisories/GHSA-75v8-2h7p-7m2m)

### Inferences
- multer is the lowest-risk choice for this repo. It is maintained by the Express team, every 2026 security fix landed quickly, and it plugs into Express as route middleware. The repeated DoS advisories mean the version should be pinned exactly (`"multer": "2.5.0"`) and bumped deliberately.
- For an app that only runs locally, `memoryStorage()` with `limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 10, parts: 12, fieldNestingDepth: 1, fieldArrayIndexLimit: 0 }` is simplest. It keeps the buffer available for magic-byte sniffing and text extraction before anything is written to disk, which avoids the orphaned-partial-file class of bug entirely. Write the original yourself afterwards with the project's existing temp-then-rename helper (`jsonStore` pattern).
- Use a synchronous `fileFilter` that only checks the extension against an allow-list, because the async-fileFilter advisories (GHSA-q7qp-rjg7-q26m, GHSA-qvfw-j98x-7q72) affected that path. Do real type checks after upload with `file-type`.
- Map `MulterError.code === 'LIMIT_FILE_SIZE'` to a Vietnamese 413 message in the UI.

### Gaps
- The multer README does not state Express 5 compatibility explicitly. It is plain `(req, res, next)` middleware from the expressjs org, so compatibility is very likely, but no explicit statement was found.
- The GitHub REST advisory API was rate-limited, so advisory details beyond title, range and severity were not fetched.
- The busboy licence field is absent from npm metadata (historically MIT; not verified this session).

## DOCX text extraction (mammoth and alternatives): licence, maintenance, security

### Takeaway
`mammoth` 1.13.0 (BSD-2-Clause, actively released through Sept 2026) is the right choice. `extractRawText` gives plain text; `convertToHtml` keeps headings and lists. It must be 1.11.0 or later because of a directory-traversal CVE, and it pulls in `@xmldom/xmldom` 0.8.x and `jszip`, whose advisory history means the lockfile should resolve to their latest versions.

### Cited Findings
- mammoth latest = 1.13.0, BSD-2-Clause, repo `github.com/mwilliamson/mammoth.js`, engines `>=12`. Recent releases: 1.12.1 (2026-08-09), 1.12.2 (2026-08-28), 1.12.3 (2026-09-12), 1.13.0 (2026-09-26). Dependencies include `jszip ^3.7.1`, `@xmldom/xmldom ^0.8.6`, `lop`, `underscore`, `xmlbuilder`, `base64-js`, `argparse`, `dingbat-to-unicode`. — [npm: mammoth](https://www.npmjs.com/package/mammoth)
- CVE-2025-11849 / GHSA-rmjr-87wv-gf87 (moderate per GitHub; other scorers range from 5.4 to 9.3): directory traversal in mammoth >=0.3.25 <1.11.0. It is triggered by docx images that use external links (`r:link`) instead of embedded images, and can read arbitrary local files. The fix also turned external file access off by default. — [GHSA-rmjr-87wv-gf87](https://github.com/advisories/GHSA-rmjr-87wv-gf87); [NVD CVE-2025-11849](https://nvd.nist.gov/vuln/detail/CVE-2025-11849); [Snyk](https://security.snyk.io/vuln/SNYK-JS-MAMMOTH-13554470)
- `@xmldom/xmldom` (mammoth's XML parser) has many 2025-2026 advisories on the 0.8 line, including High-severity quadratic-time/memory parsing DoS and ReDoS affecting `>=0.7.0 <=0.8.14` (e.g. [GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6), [GHSA-x4fp-j954-r2f4](https://github.com/advisories/GHSA-x4fp-j954-r2f4), [GHSA-965w-775f-mr7g](https://github.com/advisories/GHSA-965w-775f-mr7g), [GHSA-93r5-fhx6-vmg9](https://github.com/advisories/GHSA-93r5-fhx6-vmg9)). The `lts` dist-tag is 0.8.15. `latest` is 0.9.12. — [npm: @xmldom/xmldom](https://www.npmjs.com/package/@xmldom/xmldom)
- jszip latest = 3.10.2, licence `(MIT OR GPL-3.0-or-later)`. Advisories: path traversal via loadAsync <3.8.0 ([GHSA-36fh-84j7-cv5h](https://github.com/advisories/GHSA-36fh-84j7-cv5h)) and prototype pollution 3.0.0-3.7.0 ([GHSA-jg8v-48h5-wgxg](https://github.com/advisories/GHSA-jg8v-48h5-wgxg)). Both are fixed in 3.10.2. — [npm: jszip](https://www.npmjs.com/package/jszip)
- Anthropic's docs say .docx is not supported in `document` blocks: "convert them to text or PDF first". For a .docx with images, convert to PDF to use PDF support. — [Claude Files API docs](https://platform.claude.com/docs/en/build-with-claude/files); [Claude PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support)

### Inferences
- For story outlines, `mammoth.extractRawText({ buffer })` is enough. If heading structure matters (Act / Scene headings), `convertToHtml` with a small HTML-to-markdown step keeps it, but that adds a package. Raw text with paragraph breaks is usually enough for an LLM.
- mammoth 1.13.0 with `^0.8.6` should resolve `@xmldom/xmldom` to 0.8.15 (the current 0.8 LTS). The last advisories listed affect `<=0.8.14`. Check this with `npm ls @xmldom/xmldom` after install, and use an npm `overrides` entry if it resolves lower.
- Do not enable mammoth's external file access option; keep the safe default.
- mammoth loads the whole zip with jszip in memory. There is no evidence in the sources of a built-in decompressed-size cap, so zip-bomb protection has to come from a pre-check (see the security section).

### Gaps
- No other maintained DOCX text extractors were compared (e.g. `docx-preview` is a renderer, `officeparser` was not checked). mammoth's dominance and active releases made it the clear pick, but no head-to-head comparison was done.
- Whether mammoth enforces any limit on decompressed size or entry count was not verified in its source.

## PDF text extraction in Node (pdfjs-dist, unpdf, pdf-parse, pdf2json): maintenance, ESM, Windows, licences, scanned PDFs

### Takeaway
Use `unpdf` 2.2.2 (MIT, unjs, ESM, ships its own serverless PDF.js 6.5.438 build, needs Node >=24, which this machine has: v24.12.0). It is pure JS for text extraction, so there is no native build on Windows. `pdfjs-dist` 6.5.438 (Apache-2.0, Mozilla) directly is the fallback. Avoid `pdf-parse` 2.x (pins an older pdfjs-dist 5.4.296 plus a native canvas binary, last release Oct 2025) and `pdf2json` (more complex JSON output than needed).

### Cited Findings
- unpdf latest = 2.2.2 (2026-11-23; 2.1.0 on 2026-10-30, 2.2.0 on 2026-11-14), MIT, ESM (`type: module`), engines `node >=24`, repo `github.com/unjs/unpdf`. — [npm: unpdf](https://www.npmjs.com/package/unpdf)
- unpdf README: "The serverless PDF.js bundle is built from PDF.js v6.5.438". It works in "Node.js 24+, Bun, browsers, and serverless environments". API: `const pdf = await getDocumentProxy(new Uint8Array(buffer)); const { totalPages, text } = await extractText(pdf, { mergePages: true })`. Without `mergePages`, `text` is a per-page array. `@napi-rs/canvas` is only needed for `renderPageAsImage`; text extraction needs no canvas. — [unjs/unpdf README](https://github.com/unjs/unpdf)
- pdfjs-dist latest = 6.5.438 (2026-11-01; 6.2.108 Jul, 6.3.289 Aug, 6.4.299 Oct 2026), Apache-2.0, engines `>=22.13.0 || >=24`. — [npm: pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist)
- pdfjs-dist advisory: High, arbitrary JavaScript execution when opening a malicious PDF, `<=4.1.392` ([GHSA-wgrm-67xf-hhpq](https://github.com/advisories/GHSA-wgrm-67xf-hhpq)). No advisories returned for 6.5.438. — [npm bulk advisory endpoint](https://registry.npmjs.org/-/npm/v1/security/advisories/bulk)
- pdf-parse latest = 2.4.5 (repo now `github.com/mehmet-kozan/pdf-parse`), Apache-2.0, ESM, engines `>=20.16.0 <21 || >=22.3.0`. The newest publishes on npm are 1.1.2-1.1.4 backports (late Oct 2025). Dependencies pin `pdfjs-dist 5.4.296` and `@napi-rs/canvas 0.1.80`. — [npm: pdf-parse](https://www.npmjs.com/package/pdf-parse)
- pdf2json latest = 4.1.1 (modified 2026-11-06), Apache-2.0, ESM, engines `>=22.23.2`. — [npm: pdf2json](https://www.npmjs.com/package/pdf2json)
- Claude PDF support processes each page as an image plus extracted text, so Claude can read visual content (and by extension scanned pages) through vision. — [Claude PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support)

### Inferences
- Scanned PDFs: unpdf/pdfjs return little or no text for image-only pages. Detect this (for example, fewer than ~50 non-space characters per page on average) and show the user a Vietnamese message ("File PDF này là ảnh chụp, không có chữ"), then either (a) send the PDF itself to Claude through the mailbox or API so vision reads it, or (b) offer local OCR later. Local OCR would add tesseract.js (WASM; not researched here) or a Python OCR step in brick-engine. Since OCR is not required, (a) is the lowest-effort option.
- Pin `unpdf` exactly. It ships PDF.js internally, so updating unpdf also updates PDF.js and its security fixes.
- Run PDF parsing in a `worker_threads` Worker with `resourceLimits` and a timeout so a hostile PDF cannot freeze the server's event loop. This is a Node built-in, so no new package is needed.

### Gaps
- unpdf's ESM-only status is implied by `type: module` but not stated in the README.
- No Windows-specific issue reports were searched for unpdf/pdfjs-dist. Pure-JS text extraction makes Windows problems unlikely, but this was not verified.
- tesseract.js and other OCR options were not researched (out of scope, OCR not required).

## Sending files to Claude: API PDF support / Files API vs local extraction vs the Claude Code mailbox

### Takeaway
For outlines, extract text locally and send plain text: it is cheapest, works for every format, and works for both the API path and the mailbox path. Send the raw PDF to Claude only when the PDF has no text layer or its layout and visuals matter. The project's AI path today is Gemini (`@google/genai`) plus the Claude Code mailbox, so the mailbox needs no new SDK. Claude Code's Read tool reads `.pdf`, `.md` and `.txt` itself, but a `.docx` should be converted to `.md`/`.txt` by the server before it is queued.

### Cited Findings
- PDF limits: max request size 128 MB on the first-party Claude API. Max 600 pages per request (100 when the request's context window is under 1M tokens). Both limits apply to the whole request payload. Dense PDFs can fill the context before the page limit. — [Claude PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- PDF token cost: text typically 1,500-3,000 tokens per page, plus at most 1,568 visual tokens per page image. There is no extra PDF fee. — [Claude PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- PDFs can be sent as base64, by URL, or via Files API `file_id`. The docs recommend the Files API for large or repeatedly used PDFs. Bedrock and Google-managed Vertex support base64 only. — [Claude PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- The Files API is now stable and needs no beta header (`files-api-2025-04-14` is optional/legacy). The TypeScript SDK uses `client.files.upload({ file: await toFile(createReadStream(path), undefined, { type: 'application/pdf' }) })`. Max 500 MB per file, 1 TB per organization. Optional `expires_in_seconds` takes 3,600 to 7,776,000. Files are workspace-scoped: never accept `file_id` from untrusted input. File operations are free, and content is billed as input tokens when used. ZDR: not eligible. — [Claude Files API docs](https://platform.claude.com/docs/en/build-with-claude/files)
- Document blocks support `application/pdf` and `text/plain`. .txt/.csv/.md can be uploaded as `text/plain`. .docx/.xlsx are not supported in document blocks and should be converted to plain text and included directly in the message. Document blocks accept optional `title`, `context`, and `citations: { enabled: true }`. — [Claude Files API docs](https://platform.claude.com/docs/en/build-with-claude/files)
- `@anthropic-ai/sdk` latest = 1.14.0 (2026-11-24), Apache-2.0. It is not currently a dependency of `apps/server`. — [npm: @anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)
- Claude Code Read tool (tool description in this Claude Code session): "Reads PDFs via the `pages` parameter (e.g. "1-5", max 20 pages/request; required for PDFs over 10 pages)". It also reads images. — Claude Code built-in Read tool description (observed in-session; no public URL)
- Secondary sources agree that Claude Code v2.1.30 added the `pages` parameter, and that large PDFs (>10 pages) referenced with @ return lightweight references. One guide says page-range reads need `pdftoppm` (poppler). A source-code dump shows `PDF_MAX_EXTRACT_SIZE = 100 MB`. — [claudeissues.com #22908](https://claudeissues.com/issue/22908-docs-read-tool-pdf-behavior-missing-pages-parameter-and-large-pdf-mention-guidan); [agentpatch blog](https://agentpatch.pages.dev/blog/claude-code-read-pdf); [github issue 13518](https://github.com/anthropics/claude-code/issues/13518) (secondary, not official docs)

### Inferences
- Recommended flow: the upload saves the original to `workspace/projects/<tap>/sources/`, extracts text to `sources/<id>.extracted.md` (UTF-8, with a header naming the source file and page count), and validates a small `sources/index.json` manifest with zod (per project rule: schema in `packages/shared`). A mailbox job (`sessionQueue.ts`) then references the extracted `.md` path. Claude Code reads it with the Read tool, so nothing needs a new SDK.
- For PDFs with an empty text layer, put the original PDF path in the mailbox job instead. Claude Code can read it page-range by page-range (max 20 pages per Read). Tell Claude in the job text to use `pages` for files over 10 pages.
- If a direct API path is added later: send extracted text as a `document` block with `source: { type: 'text', media_type: 'text/plain', data }` or as a plain text block, add `cache_control` if several prompts reuse the same outline, and keep text under a size budget (for example 200k characters) with a Vietnamese error above that. Base64 PDF is fine for a local tool under 128 MB. The Files API only pays off when the same file is reused across many requests.
- Wrap the extracted text in clear delimiters (for example `<outline_document>...</outline_document>`) and tell the model to treat it as story data, not instructions. User-uploaded documents are a prompt-injection surface even in a local app.

### Gaps
- No official Anthropic Claude Code docs page for the Read tool's PDF limits was fetched. The 20-pages and 10-pages numbers come from the tool description in this session plus secondary sources. The poppler requirement on Windows is unverified.
- Whether the Read tool handles .docx natively was not confirmed. Treat it as unsupported and convert first.
- The `source.type: "text"` document-block shape was not re-verified on the current docs page this session (the Files page confirms `text/plain` via `file_id`).

## Security: zip bombs in DOCX, path traversal, size limits, MIME sniffing (file-type)

### Takeaway
Defend in layers. (1) Use multer `limits` (about 20 MB, 1 file). (2) Check the extension against an allow-list. (3) Sniff magic bytes with `file-type` 22.3.0 for binary formats (pdf, docx/zip), and use a strict UTF-8 decode plus NUL-byte check for text formats (txt/md/fountain/fdx). (4) Pre-scan DOCX zips (entry count, total uncompressed size, compression ratio) before mammoth. (5) Store the file under a server-generated name, never `originalname`, and check that the resolved path stays inside the project folder. (6) Run extraction in a worker with memory and time limits.

### Cited Findings
- file-type latest = 22.3.0 (2026-10-29), MIT, ESM-only (`type: module`), engines `node >=22`. — [npm: file-type](https://www.npmjs.com/package/file-type)
- file-type advisories: zip decompression bomb DoS via the `[Content_Types].xml` entry, `>=20.0.0 <=21.3.1` ([GHSA-j47w-4g3g-c36v](https://github.com/advisories/GHSA-j47w-4g3g-c36v)). Infinite loop in the ASF parser, `>=13.0.0 <21.3.1` ([GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473)). Infinite loop on malformed MKV, `<16.5.4` ([GHSA-mhxj-85r3-2x55](https://github.com/advisories/GHSA-mhxj-85r3-2x55)). No advisories returned for 22.3.0. — [npm bulk advisory endpoint](https://registry.npmjs.org/-/npm/v1/security/advisories/bulk)
- yauzl latest = 3.4.0 (modified 2026-06-07), MIT, engines `>=12`. It reads the zip central directory, giving entry counts and declared sizes without inflating. No advisories were returned in the bulk query. — [npm: yauzl](https://www.npmjs.com/package/yauzl)
- sanitize-filename latest = 1.6.5 (2026-11-07), `WTFPL OR ISC`. — [npm: sanitize-filename](https://www.npmjs.com/package/sanitize-filename)
- multer does not sanitize `file.originalname`. With `preservePath` it includes client path segments, and error objects carry the untrusted client filename. — [multer README](https://github.com/expressjs/multer)
- mammoth <1.11.0 could be made to read arbitrary local files via external image links in a crafted docx. — [GHSA-rmjr-87wv-gf87](https://github.com/advisories/GHSA-rmjr-87wv-gf87)
- The Anthropic Files API itself rejects filenames containing `< > : " | ? * \ /` or control characters 0-31, and names over 255 characters. That is a useful reference rule set for sanitizing names on Windows too. — [Claude Files API docs](https://platform.claude.com/docs/en/build-with-claude/files)

### Inferences
- Path traversal: build the save path from server-controlled parts only, for example `path.join(projectsRoot, episodeId, 'sources', `${crypto.randomUUID()}${allowedExt}`)`. Validate `episodeId` with a strict regex (`/^[a-z0-9_-]{1,64}$/i`), then check `path.resolve(target).startsWith(path.resolve(projectsRoot) + path.sep)`. Keep the original name only as display text in the manifest, after `path.basename`, NFC normalization, and sanitize-filename (or an equivalent regex), because Windows reserved names (CON, NUL, COM1...) and trailing dots or spaces are a Windows-specific trap. Skipping sanitize-filename and never using the original name in a path avoids one more package.
- MIME sniffing: never trust the browser's `Content-Type` or the multer `mimetype`. `fileTypeFromBuffer(buf)` should return `pdf` for .pdf and `docx` (or at least `zip`) for .docx. Plain-text formats (.txt, .md, .fountain, and .fdx XML) have no magic number. For those, require `new TextDecoder('utf-8', { fatal: true }).decode(buf)` to succeed, reject buffers containing `\u0000`, strip a UTF-8 BOM, and for .fdx check that the text starts with `<?xml` and contains `<FinalDraft`.
- Zip bomb (DOCX): before mammoth, open the buffer with yauzl (`fromBuffer`, `lazyEntries`) and reject if entries > 2,000, sum of `uncompressedSize` > 100 MB, any single entry ratio > 100:1, or there are path entries containing `..` or absolute paths. Declared sizes can be falsified, so also run mammoth inside a Worker with `resourceLimits: { maxOldGenerationSizeMb: 512 }` and a ~20 s timeout (terminate the worker on timeout). If adding yauzl is not approved, the worker limits alone still stop a bomb from crashing the main server.
- PDF: also parse in the same Worker sandbox with limits. Optionally cap pages (for example, the first 300 pages) for outlines.
- Keep `express.json()` limits small on other routes. The upload route only gets multipart via multer on that single route.

### Gaps
- Whether file-type 22.x reports `docx` versus generic `zip` for every Word-produced file was not tested this session.
- Exact zip-bomb thresholds are engineering judgement, not sourced numbers.
- sanitize-filename's handling of Windows reserved names is from prior knowledge of its README, not re-fetched this session.

## Recommended package list (exact current versions and licences) and minimal design

### Takeaway
The minimal set is four runtime packages: `multer@2.5.0` (MIT), `mammoth@1.13.0` (BSD-2-Clause), `unpdf@2.2.2` (MIT), and `file-type@22.3.0` (MIT). Add `@types/multer` as a dev dependency if typings are needed (not checked). `yauzl@3.4.0` (MIT) is optional for zip-bomb pre-checks, and `@anthropic-ai/sdk@1.14.0` (Apache-2.0) is only needed if a direct API path is added. .md/.txt/.fountain need no library, and .fdx can be handled with a small XML-to-text step. All of these need user approval under the project's package rule.

### Cited Findings
- multer 2.5.0, MIT — [npm](https://www.npmjs.com/package/multer)
- mammoth 1.13.0, BSD-2-Clause — [npm](https://www.npmjs.com/package/mammoth)
- unpdf 2.2.2, MIT, Node >=24 — [npm](https://www.npmjs.com/package/unpdf)
- pdfjs-dist 6.5.438, Apache-2.0 (fallback / what unpdf bundles) — [npm](https://www.npmjs.com/package/pdfjs-dist)
- file-type 22.3.0, MIT, Node >=22, ESM — [npm](https://www.npmjs.com/package/file-type)
- yauzl 3.4.0, MIT (optional) — [npm](https://www.npmjs.com/package/yauzl)
- sanitize-filename 1.6.5, WTFPL OR ISC (optional) — [npm](https://www.npmjs.com/package/sanitize-filename)
- @anthropic-ai/sdk 1.14.0, Apache-2.0 (optional; only for a direct API path) — [npm](https://www.npmjs.com/package/@anthropic-ai/sdk)
- fountain-js 1.2.4, MIT, last modified 2023-11-14 (stale; not recommended) — [npm](https://www.npmjs.com/package/fountain-js)
- Not recommended: pdf-parse 2.4.5 (Apache-2.0; pins pdfjs-dist 5.4.296 and native @napi-rs/canvas 0.1.80; last release Oct 2025) — [npm](https://www.npmjs.com/package/pdf-parse). formidable 3.5.4 (MIT; 4.x stuck at RC since May 2025) — [npm](https://www.npmjs.com/package/formidable). Raw busboy 1.6.0 (no release since 2022) — [npm](https://www.npmjs.com/package/busboy)

### Inferences
- Minimal design for `apps/server`:
  1. `POST /api/projects/:ep/sources` with `multer({ storage: multer.memoryStorage(), limits: {...}, fileFilter: syncExtAllowList }).single('file')`. Allowed extensions: `.docx .pdf .md .txt .fountain .fdx`.
  2. `sniff(buf, ext)`: use file-type for pdf/docx, and strict UTF-8 plus a NUL check for text formats. Reject on mismatch with a Vietnamese message.
  3. `extract(buf, kind)` in a Worker with resource limits. docx uses `mammoth.extractRawText`. pdf uses `unpdf.extractText(..., { mergePages: false })`, keeping page breaks as `--- trang N ---`. md/txt/fountain decode as is (Fountain is already plain-text screenplay markup an LLM reads well). fdx parses XML and joins `<Paragraph Type="...">` text with type labels (Scene Heading, Character, Dialogue).
  4. Normalize: CRLF to LF, NFC, collapse 3+ blank lines, and flag `needsVision: true` if a PDF yields almost no text.
  5. Store atomically under `workspace/projects/<ep>/sources/`: `<uuid>.<ext>` (original), `<uuid>.extracted.md`, plus a zod-validated `sources/index.json` entry `{ id, originalName (display only), ext, bytes, sha256, pages?, chars, needsVision, createdAt }`. `createdAt` is fine in the server, because the determinism ban applies only to director and video-engine.
  6. Hand-off: the mailbox job points Claude Code at `<uuid>.extracted.md`, or at the original PDF when `needsVision`. An optional future API path sends the text block, or the PDF as base64 / `file_id`.
  7. Vitest: tests for sniff, path guard, normalize, and the fdx-to-text function (pure modules, per project rule), using tiny fixture files, including a fake zip bomb and a `../` filename.
- Pin exact versions in `apps/server/package.json` (repo style already pins `express` 5.3.0 exactly).

### Gaps
- `@types/multer` current version and whether multer 2.5.0 ships its own types were not checked.
- No maintained .fdx (Final Draft) npm parser was researched. The suggestion is a small custom XML-to-text step using an already present XML parser (`@xmldom/xmldom` arrives transitively via mammoth, but depending on a transitive package directly is fragile) or a regex-based paragraph extractor with tests.
- `docs/MASTER_ADD.md` section 3 (the approved package list) was not read, so which of these, if any, are already approved is unknown.
