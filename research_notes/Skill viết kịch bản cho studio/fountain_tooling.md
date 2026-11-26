# Screenplay format tooling (Fountain, FDX, Highland) for a Node/TypeScript studio

Research date: 2026-11-26. Metadata comes from the live npm registry (`registry.npmjs.org`), npm download API, GitHub REST API and raw source files. GitHub star counts and push dates were read from `api.github.com/repos/<owner>/<repo>` at research time. Nothing was installed.

## Which Fountain parsers exist for JS/TS, and how do they compare?

### Takeaway
**fountain-js** (MIT, TypeScript, zero deps, about 8.5k downloads/week) is the de-facto standard Fountain parser for Node/TS. Its output is a flat token stream that is easy to fold into `{speaker, text}`. **wildwinter/screenplay-tools** (MIT, actively maintained Nov 2026) is the strongest alternative. It has a format-agnostic `Script` model, a Fountain writer, a callback parser that groups character with dialogue, and a pure-JS FDX parser/writer. Its drawback is that it is not on npm, so it has to be vendored. Most other JS parsers are stale, deprecated, or tied to VS Code.

### Cited Findings

**fountain-js (jonnygreenwald/fountain-js)** — recommended primary parser
- npm `fountain-js` latest is 1.2.4, published 2023-11-14. License MIT, ships types `./dist/index.d.ts`, no runtime dependencies, unpacked size 110 KB — [npm registry](https://registry.npmjs.org/fountain-js)
- The GitHub repo has 50 stars, is MIT, written in TypeScript, last pushed 2025-11-18, and is not archived. That means there are unreleased changes after the last npm publish (2023-11) — [GitHub API](https://api.github.com/repos/jonnygreenwald/fountain-js)
- Weekly downloads were 8,464 for 2026-11-18 to 2026-11-24, far above every other Fountain package — [npm downloads API](https://api.npmjs.org/downloads/point/last-week/fountain-js)
- It ships both CJS (`main: dist/index.js`) and ESM (`module: dist.esm/index.js`) builds — [package.json on jsDelivr](https://cdn.jsdelivr.net/npm/fountain-js@1.2.4/package.json)
- API: `new Fountain().parse(text, true)` returns `{ title, html: { title_page, script }, tokens }`. Token fields are `type`, `text?`, `scene_number?`, `dual?` ('left'/'right' on `dialogue_begin`), `depth?` and `is_title?` — [README](https://cdn.jsdelivr.net/npm/fountain-js@1.2.4/README.md)
- Token types include `scene_heading`, `action`, `character`, `dialogue`, `parenthetical`, `transition`, `page_break`, `dialogue_begin`/`dialogue_end`, and `dual_dialogue_begin`/`dual_dialogue_end`. The rule file also has `centered`, `lyrics`, `section`, `synopsis`, `note` and `boneyard` — [README](https://cdn.jsdelivr.net/npm/fountain-js@1.2.4/README.md), [rules.js](https://cdn.jsdelivr.net/npm/fountain-js@1.2.4/dist/rules.js)
- The token list is flat, "not like a usual AST". Since 1.1.2, inline markup (emphasis/underline) is left raw in token text. It supports Fountain syntax up to v1.1. The README documents no Fountain writer/serializer — [README](https://cdn.jsdelivr.net/npm/fountain-js@1.2.4/README.md)
- `fountain.ts` (same author) is deprecated "in favor of 'fountain-js'" — [npm registry](https://registry.npmjs.org/fountain.ts)

**screenplay-tools (wildwinter/screenplay-tools)** — best data model, FDX included, but not on npm
- Repo has 29 stars, is MIT, last pushed 2026-11-18, not archived, primary language C++. Libraries are in C++, JavaScript, Python and C# — [GitHub API](https://api.github.com/repos/wildwinter/screenplay-tools), [README](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/README.md)
- Root package.json is version 0.0.11. The JS package is named `screenplay-tools-js` and is built with rollup into a zip on GitHub Releases. It is not on the npm registry: `screenplay-tools` returns "Not found" — [root package.json](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/package.json), [js package.json](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/javascript/package.json), [npm registry](https://registry.npmjs.org/screenplay-tools)
- Distribution is a JS ES module (`screenplayTools.js`) plus a minified browser IIFE. No TypeScript types are mentioned. A fetch of the repo page showed the Releases section as empty, which conflicts with the README pointing to Releases — [GitHub repo page](https://github.com/wildwinter/screenplay-tools)
- Model: a `Script` has `titleEntries`, `elements`, `notes` and `boneyards`. Element types are Action, Scene Heading, Character, Dialogue, Parenthetical, Transition, Lyrics, Page Break, Section and Synopsis. The library provides an incremental `Parser` (`addText`/`addLines`/`addLine`), a `CallbackParser` that "aggregates things like character and dialogue lines together", and a Fountain `Writer`. Options include `mergeActions`/`mergeDialogue`, and an opt-in `useTags` extension. Sections are extended to 6 levels — [README](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/README.md)
- The README API section labels FDX Parser/Writer as "C#" only, but the JS entry file exports `./fdx/parser` and `./fdx/writer`. The JS `FDXParser` uses `fast-xml-parser` (^5.12.1, the only runtime dependency), so it runs in Node without a DOM — [screenplayTools.js](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/javascript/src/screenplayTools.js), [fdx/parser.js](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/javascript/src/fdx/parser.js). The docs and the code disagree here; the code is authoritative.
- The JS `dist`/`pack` scripts use `rm -rf`, `cp`, `mkdir -p` and `zip`, so building from source on Windows needs Git Bash or WSL — [js package.json](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/javascript/package.json)

**Other JS parsers (mostly stale)**
- **Fountain.js (mattdaly)**: 271 stars, MIT, last pushed 2024-03-30. It is the original JS parser that fountain-js, ftnbuild and others were forked from. Plain JS, not on npm under this name — [GitHub API](https://api.github.com/repos/mattdaly/Fountain.js), [npm fountain.ts description](https://registry.npmjs.org/fountain.ts)
- **betterfountain (piersdeseilligny)**: 454 stars, MIT, last pushed 2026-09-11, version 1.14.2. It is a VS Code screenwriting extension, not a library. Its parser `src/afterwriting-parser.ts` imports `vscode` (`Range`, `Position`, `getFountainConfig`), so it cannot be used standalone in Node without forking and stripping it. Not on npm — [GitHub API](https://api.github.com/repos/piersdeseilligny/betterfountain), [parser source](https://raw.githubusercontent.com/piersdeseilligny/betterfountain/master/src/afterwriting-parser.ts), [package.json](https://raw.githubusercontent.com/piersdeseilligny/betterfountain/master/package.json)
- **afterwriting-labs (ifrost)**: 280 stars, last pushed 2026-01-28. The GitHub API reports license `null`, but the README and package.json state MIT. On npm, `afterwriting` 1.17.3 was published 2020-12-28 with an unpacked size of 32.8 MB, and its dependencies include d3, jquery, handlebars, pdfkit, lodash, requirejs-text and snyk — [GitHub API](https://api.github.com/repos/ifrost/afterwriting-labs), [README](https://raw.githubusercontent.com/ifrost/afterwriting-labs/master/README.md), [npm registry](https://registry.npmjs.org/afterwriting)
- **aw-parser / aw-liner** (afterwriting's standalone parser and line splitter): MIT, last published 2018-07-28 and 2018-05-07, no types — [npm aw-parser](https://registry.npmjs.org/aw-parser), [npm aw-liner](https://registry.npmjs.org/aw-liner)
- **screenplay-js (Guernsey-Creative / nguernse)**: version 0.0.18, published 2022-01-26, MIT, has types, depends on uuid, 71 downloads/week. It is "based on fountain-js and afterwriting-labs". `FountainParser.parse(str, opts)` returns `ScriptJSON` (title/credit/authors/…, `scenes: string[]`, HTML/pages, optional `tokens`). FDX-to-Fountain exists only as a Vue example in the repo, not as a library API — [npm registry](https://registry.npmjs.org/screenplay-js), [README](https://cdn.jsdelivr.net/npm/screenplay-js@0.0.18/README.md), [npm downloads](https://api.npmjs.org/downloads/point/last-week/screenplay-js)
- **fountain-parser (oparaskos)**: version 1.1.2, published 2023-11-22, TypeScript, built for vscode-fountain. The repo has 0 stars and was last pushed 2023-11-22. The license conflicts: npm says MIT, the GitHub API says MPL-2.0. Its dependencies are unusual for a parser (`gender-detection-from-name`, `sentiment`, `readability-scores`, `memoize`, `yaml`), and it unpacks to 838 KB — [npm registry](https://registry.npmjs.org/fountain-parser), [GitHub API](https://api.github.com/repos/oparaskos/fountain-parser)
- **jouvence (TypingFrog)**: event-driven JS parser. Version 1.0.1 was published 2015-03-29 under BSD, depends on es6-promise, 22 downloads/week. The GitHub repo is gone (404) — [npm registry](https://registry.npmjs.org/jouvence), [npm downloads](https://api.npmjs.org/downloads/point/last-week/jouvence)
- **ftnbuild (mgmarlow)**: fork of Fountain.js with HTML/JSON output. Version 0.2.0 published 2021-10-24, last push 2021-12-25, 2 stars — [npm registry](https://registry.npmjs.org/ftnbuild), [GitHub API](https://api.github.com/repos/mgmarlow/ftnbuild)
- **@thombruce/fountainjs**: version 2.2.2, published 2025-11-04, MIT, 1 star, no types field — [npm registry](https://registry.npmjs.org/%40thombruce%2Ffountainjs), [GitHub API](https://api.github.com/repos/thombruce/FountainJS)
- **npm `fountain` (giuliandrimba)**: version 0.3.4, published 2013, no license field. Abandoned — [npm registry](https://registry.npmjs.org/fountain)

**Fountain spec facts relevant to mapping**
- The latest spec version is 1.1 (2014-03-14). There is no 2.0 — [fountain.io syntax](https://fountain.io/syntax/)
- A Character cue is an all-uppercase line with a blank line before it and none after, containing at least one letter. A leading `@` forces a character cue for mixed-case names or "non-Roman languages". Extensions such as `(O. S.)` follow on the same line. `^` at the end of the second cue marks dual dialogue. Parentheticals follow Character or Dialogue. Transitions end in `TO:` or are forced with `>`. Scene headings start with INT/EXT/EST/I/E or are forced with `.`. Notes use `[[ ]]`, boneyard uses `/* */`, sections use `#`, and synopses use `=` — [fountain.io syntax](https://fountain.io/syntax/)

### Inferences
- **Recommendation:** use `fountain-js` as the primary dependency. It is MIT, has zero dependencies, is small (110 KB), ships types and both CJS/ESM builds, and is pure JS, so there is no Windows-specific issue. Wrap it in a thin adapter in `packages/shared` that folds tokens into `{speaker, text, parenthetical?, extension?, sceneHeading?}`. If FDX import or a Fountain writer is needed, vendor the screenplay-tools JS build (MIT). It is not on npm, so it would be a vendored file rather than an "npm package", which matters for the project's package allow-list.
- **Note:** this mapping analysis comes from reading `rules.js` and has not been run.
  - **What counts as a cue:** the fountain-js dialogue rule treats a line as a character cue if it has no ASCII lowercase `a-z` (`[^^()\na-z]+`) or starts with `@`.
  - **Vietnamese names:** all-caps Vietnamese names with diacritics (for example `BÀ NGOẠI`) should be detected. Mixed-case names (`Bà Ngoại`) need `@`.
  - **False cues:** a short line made only of uppercase or non-ASCII-lowercase letters (for example `Ừ.`, or a shouted all-caps action line) that is followed by a non-blank line could be misread as a character cue. An importer should validate against the known cast list.
- **Fold logic:** take `character` (strip a trailing `(V.O.)`/`(O.S.)`/`(CONT'D)` extension, `^` and leading `@`) and pair it with the following `dialogue` tokens until `dialogue_end`. Keep `parenthetical` as metadata and drop `action`/`transition` or map them to narrator lines. Inline `*`/`_` markup is left in token text and must be stripped before TTS.
- Because screenplay-tools' `CallbackParser` already aggregates character + parenthetical + dialogue, it is the closest out-of-the-box shape to `{speaker, text}`.

### Gaps
- I did not verify whether fountain-js's unreleased commits (2025-11) fix bugs or change token output.
- I could not confirm the GitHub Releases contents for screenplay-tools: the API was rate-limited and the page fetch showed none. Whether a prebuilt JS zip is downloadable is unconfirmed.
- I did not check GitHub stars for screenplay-js because the API was rate-limited during research.
- None of the parsers were tested against Vietnamese text.

## Which libraries handle FDX (Final Draft XML) import/export in JS?

### Takeaway
There is no maintained npm package dedicated to FDX. The two realistic options are: (1) the JS FDX parser/writer inside wildwinter/screenplay-tools, which is pure JS on `fast-xml-parser`, MIT, and vendored; and (2) JumpCut (Rust, MIT, active) via WebAssembly, which you have to build yourself. A third option is a small in-house FDX reader on `fast-xml-parser`, since FDX is simple `<Paragraph Type="...">` XML.

### Cited Findings
- screenplay-tools JS `FDXParser.parse(xml)` uses `fast-xml-parser` and maps `FinalDraft.Content.Paragraph` into `Action`, `SceneHeading`, `Character`, `Dialogue`, `Parenthetical` and `Transition` elements. The library also exports an FDX writer — [fdx/parser.js](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/javascript/src/fdx/parser.js), [screenplayTools.js](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/javascript/src/screenplayTools.js)
- JumpCut "converts screenplays between Fountain and Final Draft's FDX format. It also creates PDFs, HTML, plain text, and JSON", and can be used "from JavaScript through WebAssembly". License MIT — [JumpCut README](https://raw.githubusercontent.com/SimonGZ/jumpcut/main/README.md), [GitHub](https://github.com/SimonGZ/jumpcut)
- On crates.io, JumpCut's latest version is 2.1.0, updated 2026-09-14 — [crates.io API](https://crates.io/api/v1/crates/jumpcut)
- JumpCut WASM functions: `parse_to_json_string`, `parse_to_fdx_string`, `parse_to_fountain_string`, `parse_to_html_string`, `parse_to_pdf_bytes`, and for FDX input `parse_fdx_to_fountain_string`/`parse_fdx_to_html_string`/`parse_fdx_to_pdf_bytes`. The package is built locally with `./scripts/wasm/generate-package.sh --target nodejs` (a shell script needing Rust and wasm-pack). There is no FDX-to-JSON function, so FDX would go FDX → Fountain → JSON — [JumpCut wasm.md](https://raw.githubusercontent.com/SimonGZ/jumpcut/main/docs/wasm.md)
- `jumpcut-wasm` is not on npm ("Not found"). The npm package named `jumpcut` (0.1.0, 2019) is an unrelated, UNLICENSED package — [npm jumpcut-wasm](https://registry.npmjs.org/jumpcut-wasm), [npm jumpcut](https://registry.npmjs.org/jumpcut)
- screenplay-js offers FDX-to-Fountain only as a VueJS example in its repo, not as an exported API — [screenplay-js README](https://cdn.jsdelivr.net/npm/screenplay-js@0.0.18/README.md)
- Non-JS FDX tools turned up in search: rsdoiel/fdx (Go, experimental) and Textplay (Ruby, Fountain → FDX one-way) — [web search results: rsdoiel/fdx mirror](https://backiee.wasmer.app/https_github_com/rsdoiel/fdx), [Textplay](https://github.com/overvale/Textplay)
- The npm package `fdx` is unrelated: it is a websocket "full-duplex commands" library — [npm registry](https://registry.npmjs.org/fdx)

### Inferences
- For a Windows desktop app, the screenplay-tools JS FDX module is lower-friction than JumpCut. JumpCut needs a Rust toolchain plus a bash script to build the WASM package, and there is no published npm artifact.
- FDX import is a "nice to have". Final Draft, Highland and Fade In can all export Fountain, so supporting Fountain alone covers most human-written screenplays.

### Gaps
- I did not assess how complete screenplay-tools' JS FDX parser is for dual dialogue, revisions, ScriptNotes or title page.
- I could not find the schema of JumpCut's JSON output; the README does not describe it.

## Are Fountain → PDF/HTML renderers (afterwriting CLI, Wrap, screenplain) worth adding?

### Takeaway
Probably not for the core pipeline. The studio's output is video, not a printed script. If a printable script preview is ever wanted, fountain-js already emits HTML. JumpCut (MIT, active) is the best-maintained PDF route, but it needs a self-built binary or WASM. afterwriting is heavy and stale on npm, Wrap is officially unmaintained, and screenplain is Python.

### Cited Findings
- afterwriting provides Fountain → PDF conversion and a "CLI for node.js". The npm `afterwriting` package was last published 2020-12-28 and is 32.8 MB unpacked, with jquery, d3, pdfkit and snyk as dependencies — [afterwriting README](https://raw.githubusercontent.com/ifrost/afterwriting-labs/master/README.md), [npm registry](https://registry.npmjs.org/afterwriting)
- Wrap (Wraparound/eprovst) is a CLI that converts Fountain/Wrap to HTML or PDF, with Windows builds available. The README says: "currently not actively maintained … use at your own risk" — [Wrap README](https://raw.githubusercontent.com/Wraparound/wrap/master/README.md)
- screenplain (vilcans) is Python, MIT, 187 stars, last pushed 2026-11-21 (active) — [GitHub API](https://api.github.com/repos/vilcans/screenplain)
- JumpCut outputs PDF/HTML/FDX/JSON from Fountain natively, via a CLI (`cargo install jumpcut`) or WASM — [JumpCut README](https://raw.githubusercontent.com/SimonGZ/jumpcut/main/README.md), [wasm.md](https://raw.githubusercontent.com/SimonGZ/jumpcut/main/docs/wasm.md)
- fountain-js `parse()` already returns `html.title_page` and `html.script` — [fountain-js README](https://cdn.jsdelivr.net/npm/fountain-js@1.2.4/README.md)
- nyousefi/Fountain (Objective-C reference implementation): 690 stars, last pushed 2023-06-10. Not usable from Node — [GitHub API](https://api.github.com/repos/nyousefi/Fountain)

### Inferences
- If a "view script" panel is wanted in studio-ui, render fountain-js HTML with your own CSS. Adding a PDF toolchain is not justified for a video studio.

### Gaps
- I did not verify screenplain's Windows install path or output quality.

## Is Fountain a good intermediate format between an LLM and the JSON pipeline?

### Takeaway
I found no published, citable pipeline of the form "LLM writes Fountain → parse → JSON". The one relevant research result (DSR, arXiv 2025/26) uses a prose intermediate, not Fountain. Fountain's real value for this studio is as a **human import/export** format. Even then it must end in schema-validated `script.json`, which fits the project rule that AI only emits JSON.

### Cited Findings
- Dual-Stage Refinement (Lei et al.; v1 2025-10-27, v3 2026-01-07) "decouples creative narrative generation from format conversion". It goes outline → novel-style prose → formatted screenplay, and reports a 75% win rate against baselines including Gemini-2.5-Pro and 82.7% of human-level performance in blind evaluation by professional screenwriters. The abstract does not mention Fountain — [arXiv 2510.23163](https://arxiv.org/abs/2510.23163v3)
- Fountain lets you write a screenplay in any plain-text editor. Its rules are whitespace- and case-sensitive (blank line before a cue, none after; all-caps cue or `@`) — [fountain.io syntax](https://fountain.io/syntax/)
- Highland (`.highland`) is a zipped, customized TextBundle containing `text.fountain`/`.markdown`/`.txt` plus JSON metadata and an assets folder. It can be unzipped to get the Fountain text. Highland 2 also opens plain `.fountain` files directly — [Quote-Unquote Apps: Highland format](https://quoteunquoteapps.com/highland-2/highland-format), [Highland Pro format](https://quoteunquoteapps.com/highland-pro/highland-format)

### Inferences
- An LLM emitting JSON directly against a zod schema (the project's current design) is more robust than emitting Fountain. Fountain's layout depends on blank lines and capitalization, which LLMs can break silently, and the parser will not error. It will just misclassify lines, for example dialogue as action. A JSON schema failure, by contrast, is loud and retryable.
- **Recommended use:**
  - **Import:** accept `.fountain` from humans, and `.highland` by unzipping and reading `text.fountain`. Parse with fountain-js, fold into `{speaker, text}`, then validate with the `packages/shared` zod schema before writing `script.json`.
  - **Export:** optionally write a `.fountain` from `script.json` so writers can edit in Highland, Final Draft or BetterFountain and round-trip. A writer is about 30 lines of code, or use screenplay-tools' `Writer`.
  - **LLM step:** if an LLM is used to clean a messy human script, have it output JSON, not Fountain.
- Speaker mapping needs a cast-alias table, because Fountain cues are free text (`MOM`, `MOM (V.O.)`, `@Bà Ngoại`) and must be resolved to `cast/*.json` IDs.

### Gaps
- I found no benchmark or blog post measuring LLM accuracy at producing valid Fountain.
- I did not deeply review vendor tools that advertise Fountain output (for example flowvideo.ai scene-writer), since that is marketing, not evidence.

## Risks: licences, abandonment, bundle size

### Takeaway
No GPL risk was found among the viable options. fountain-js, screenplay-tools, JumpCut, betterfountain, afterwriting, screenplay-js and Fountain.js are all MIT. The main risks are abandonment (most JS parsers have had no release since 2018–2023), off-npm distribution (screenplay-tools, JumpCut-WASM), and bloat (afterwriting at 32.8 MB).

### Cited Findings
- **Licences:**
  - fountain-js: MIT — [npm](https://registry.npmjs.org/fountain-js)
  - screenplay-tools: MIT — [README](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/README.md)
  - JumpCut: MIT — [GitHub](https://github.com/SimonGZ/jumpcut)
  - betterfountain: MIT — [LICENSE.md](https://raw.githubusercontent.com/piersdeseilligny/betterfountain/master/LICENSE.md)
  - jouvence: BSD — [npm](https://registry.npmjs.org/jouvence)
  - fountain-parser: conflicting MIT (npm) vs MPL-2.0 (GitHub) — [npm](https://registry.npmjs.org/fountain-parser), [GitHub API](https://api.github.com/repos/oparaskos/fountain-parser)
  - Python Jouvence (ludovicchabant): NOASSERTION — [GitHub API](https://api.github.com/repos/ludovicchabant/Jouvence)
- **Stale or abandoned items, with last publish or push date:**
  - jouvence: 2015 — [npm](https://registry.npmjs.org/jouvence)
  - npm `fountain`: 2013 — [npm](https://registry.npmjs.org/fountain)
  - aw-parser: 2018 — [npm](https://registry.npmjs.org/aw-parser)
  - afterwriting (npm): 2020 — [npm](https://registry.npmjs.org/afterwriting)
  - ftnbuild: 2021 — [npm](https://registry.npmjs.org/ftnbuild)
  - screenplay-js: 2022 — [npm](https://registry.npmjs.org/screenplay-js)
  - fountain.ts: deprecated — [npm](https://registry.npmjs.org/fountain.ts)
  - fountain-parser: 2023, 0 stars — [GitHub API](https://api.github.com/repos/oparaskos/fountain-parser)
  - Wrap: officially unmaintained — [README](https://raw.githubusercontent.com/Wraparound/wrap/master/README.md)
  - Fountain spec itself: last version 1.1, 2014 — [fountain.io](https://fountain.io/syntax/)
- **Actively maintained (pushed in 2026):**
  - screenplay-tools: 2026-11-18 — [GitHub API](https://api.github.com/repos/wildwinter/screenplay-tools)
  - betterfountain: 2026-09-11 — [GitHub API](https://api.github.com/repos/piersdeseilligny/betterfountain)
  - JumpCut: crates 2.1.0, 2026-09-14 — [crates.io](https://crates.io/api/v1/crates/jumpcut)
  - screenplain: 2026-11-21 — [GitHub API](https://api.github.com/repos/vilcans/screenplain)
  - afterwriting-labs repo: 2026-01-28 — [GitHub API](https://api.github.com/repos/ifrost/afterwriting-labs)
- fountain-js has had no npm release since 2023-11 even though its repo is active (pushed 2025-11) — [npm](https://registry.npmjs.org/fountain-js), [GitHub API](https://api.github.com/repos/jonnygreenwald/fountain-js)
- **Size and dependencies:**
  - fountain-js: 110 KB, 0 deps — [npm](https://registry.npmjs.org/fountain-js)
  - screenplay-js: 63 KB, uuid — [npm](https://registry.npmjs.org/screenplay-js)
  - fountain-parser: 838 KB, 5 deps — [npm](https://registry.npmjs.org/fountain-parser)
  - afterwriting: 32.8 MB, 10 deps including jquery/d3/pdfkit/snyk — [npm](https://registry.npmjs.org/afterwriting)
  - screenplay-tools JS: 1 dep (fast-xml-parser) — [package.json](https://raw.githubusercontent.com/wildwinter/screenplay-tools/main/javascript/package.json)

### Inferences
- fountain-js is low-risk even if it stays unpublished. It is small, MIT and zero-dependency, so pinning 1.2.4 exactly (or vendoring it) costs little, and the Fountain spec it implements has been frozen since 2014.
- Under the project's CLAUDE.md, a new npm package (fountain-js) or a vendored library (screenplay-tools JS + fast-xml-parser) is outside the allowed list in `docs/MASTER_ADD.md` §3, so the user must approve it first.
- A minimal in-house Fountain-subset parser (scene heading, cue, parenthetical, dialogue, action) is also viable at roughly 150 lines with Vitest tests, and avoids any dependency. The trade-off is re-implementing edge cases (dual dialogue, boneyard, notes, forced elements) that fountain-js already handles.

### Gaps
- I did not measure the minified bundle size of each parser; only npm unpacked sizes are reported.
- I did not check the licenses of transitive dependencies (for example fast-xml-parser's current license).
