# Claude Code / Agent Skills for Screenwriting and Short Comedic Explainer Scripts (catalogue, fetched 2026-11-26)

Method note: repo metadata (stars, licence, `pushed_at`, `created_at`) came from the public GitHub REST API (`api.github.com/repos/<owner>/<repo>`) on 2026-11-26 until the unauthenticated rate limit was hit. After that, licence names were scraped from the GitHub repo pages, and some star counts came from WebFetch of the repo or directory page. "Last push" means the API `pushed_at` field (fetched 2026-11-26), not a verified last-commit date. SKILL.md files marked "read" were downloaded raw from raw.githubusercontent.com and read directly. Items marked "snippet only" were seen only in search results or directory blurbs. Nothing was installed or run.

## 1. Which repos provide screenwriting / story-structure skills or agents for Claude (SKILL.md format)?

### Takeaway
The only mature, actively maintained, screenwriting-specific skill pack is **jtydhr88/screenwriting-skills**: MIT, about 2.2k stars, last push 2026-11-24, 27 skills. It covers Save the Cat, Syd Field, McKee and 起承转合 (Qi-Cheng-Zhuan-He, the Chinese counterpart of kishōtenketsu) structure, dialogue, and sitcom comedy and punch-up. Its skill bodies are written in Chinese and are large. Everything else is either fiction-oriented (danjdewhurst/story-skills), a placeholder (DenisHumen/cinema-skills), a single gist with no licence, or listed but unread. Anthropic's official `anthropics/skills` repo has no screenwriting or script skill.

### Cited Findings
- **jtydhr88/screenwriting-skills.** It advertises "27 agent skills (for Claude Code and OpenAI Codex) for screenwriting, television writing and dramaturgy, distilled from 47 craft books and 23 volumes of published scripts". The skill bodies are written in Chinese, and answers come back in the language you ask in. It follows the agentskills.io standard. — [README](https://github.com/jtydhr88/screenwriting-skills)
  - **Metadata.** API figures: 2,183 stars, MIT licence, created 2026-09-06, last push 2026-11-24. — [API](https://api.github.com/repos/jtydhr88/screenwriting-skills)
    - Conflict: search snippets and claudemarketplaces put it at about 1.8K stars, and a mirror listing says 26 skills rather than 27. — [claudemarketplaces](https://claudemarketplaces.com/plugins/jtydhr88-screenwriting-skills); [hysenlabs mirror](https://hysenlabs.com/projects/jtydhr88-screenwriting-skills)
  - **Install.** Add the marketplace with `/plugin marketplace add jtydhr88/screenwriting-skills`, then run `/plugin install screenwriting@screenwriting-skills`. Skills are invoked as `/screenwriting:sw-dialogue`. Alternatively, copy `plugins/screenwriting/skills/*` into `.claude/skills/` in the project. — [README](https://github.com/jtydhr88/screenwriting-skills)
  - **Files.** The tree has 93 files. The skill folders are:
    - sw-story-structure, sw-dialogue, sw-scene-craft, sw-sitcom-comedy, sw-premise-theme
    - sw-character-bio, sw-character-conflict, sw-genre-anatomy, sw-truby-anatomy, sw-format-adaptation
    - sw-workflow, sw-writers-room, sw-series-structure, sw-series-engine-bible, sw-japanese-screenwriting
    - several Chinese-opera skills, chekhov-dramaturgy, ozu-screenplay-style, succession-series-writing
    - The only executable file is a dev tool, `tools/check-skills.py`. — [git tree via API](https://api.github.com/repos/jtydhr88/screenwriting-skills/git/trees/HEAD?recursive=1)
  - **`sw-story-structure` (read, 31 KB).** It merges six systems:
    - Syd Field's paradigm and plot points
    - Blake Snyder's Save the Cat 15-beat sheet and board
    - McKee (inciting incident, progressive complications, crisis-climax-resolution, value-charge turn per scene)
    - Hoxter's nine-beat model
    - Hicks' three acts as attraction, anticipation and satisfaction
    - Lu Jun's Chinese short-play rules, including 起承转合 (introduction, development, turn, conclusion) and 凤头猪肚豹尾 ("phoenix head, pig belly, leopard tail": a striking opening, a full middle, a sharp ending)
    - Use: outlining, a saggy second act, openings and endings, and "nothing happens". — [SKILL.md](https://raw.githubusercontent.com/jtydhr88/screenwriting-skills/HEAD/plugins/screenwriting/skills/sw-story-structure/SKILL.md)
  - **`sw-sitcom-comedy` (read, 37.8 KB).** Its sources are Evan S. Smith's *Writing Television Sitcoms*, Neil Landau's seven-step formula, Richard Blum, Fleabag direct address, Pamela Douglas on dramedy, and Jesse Armstrong.
    - It covers setup and punchline mechanics, toppers, running gags, cold open, acts and tag.
    - Its description names comedy punch-up and "raising joke density per page".
    - It has a "read only these sections for this task" table and a diagnostic checklist (section 12). — [SKILL.md](https://raw.githubusercontent.com/jtydhr88/screenwriting-skills/HEAD/plugins/screenwriting/skills/sw-sitcom-comedy/SKILL.md)
  - **`sw-dialogue` (read, 24 KB).** It draws on McKee's *Dialogue*: said, unsaid and unsayable; exposition as ammunition; beats as action and reaction.
    - Other sources: Richard Walter (economy, subtext, no small talk), Hicks, Egri, and Snyder's cover-the-names test.
    - It also has screwball-comedy dialogue conventions and covers turning a two-hander into a trialogue. — [SKILL.md](https://raw.githubusercontent.com/jtydhr88/screenwriting-skills/HEAD/plugins/screenwriting/skills/sw-dialogue/SKILL.md)
  - **`sw-workflow`.** It acts as the project orchestrator: premise, then structure, character, scenes, draft, revision and submission. — [search summary of README](https://github.com/jtydhr88/screenwriting-skills)
- **jinbaozi/screenwriting-skills.** 0 stars, MIT, created 2026-09-10, last push 2026-11-25, no description. Same name as jtydhr88's repo and created four days later, so probably a mirror or fork. — [API](https://api.github.com/repos/jinbaozi/screenwriting-skills)
- **899ms/screenwriting-skills.** Appeared in search results, but the API returned "Not Found" (deleted, renamed or private). — [search result](https://github.com/899ms/screenwriting-skills)
- **danjdewhurst/story-skills.** "Agent Skills for end-to-end story writing in markdown, packaged as Codex and Claude Code plugins." 453 stars, MIT, created 2026-02-12, last push 2026-11-25. — [API](https://api.github.com/repos/danjdewhurst/story-skills)
  - It has 1,066 files and about 28 skills (plot-structure, scene-craft, character-management, premise-workshop, editorial-review, reader-panel, line-editing, voice-style and others). It also ships a large JS/Bun CLI (`bin/story.js`, evals, build scripts). — [git tree](https://api.github.com/repos/danjdewhurst/story-skills/git/trees/HEAD?recursive=1)
  - Listed in awesome-claude-code as "Skills for planning and drafting fiction as markdown with YAML frontmatter", with a continuity checker. — [awesome-claude-code README](https://github.com/hesreallyhim/awesome-claude-code)
  - Its plot-structure skill covers three-act, hero's journey and Save the Cat. — [search result](https://github.com/danjdewhurst/story-skills)
- **bs779517/story-skills.** 9 stars, MIT, last push 2026-10-14, but created 2021-09-29: an old repo that was repurposed. It installs into `.claude/skills` through npx. — [API](https://api.github.com/repos/bs779517/story-skills); [crossaitools listing](https://crossaitools.com/skills/bs779517/story-skills/plot-structure)
- **DenisHumen/cinema-skills.** 19 stars, MIT, created and last pushed on 2026-09-26. — [API](https://api.github.com/repos/DenisHumen/cinema-skills)
  - The README says "Status: structure first ... skills are being added discipline by discipline". — [README](https://github.com/DenisHumen/cinema-skills)
  - The tree contains only `templates/skill-template/SKILL.md` and no real skill yet, so it is a placeholder. — [git tree](https://api.github.com/repos/DenisHumen/cinema-skills/git/trees/HEAD?recursive=1)
- **dandanthedan "Screenwriter Skill" gist.**
  - Contents: a single folder with SKILL.md, methodology.md (McKee, Campbell, Aristotle), style-rules.md (Hollywood format), workflow.md, timing-and-cutting.md, templates/, and `tools/` (.docx generators).
  - Dated 2026-05-01 (page `datetime`).
  - No licence was visible. — [gist](https://gist.github.com/dandanthedan/6adc014dc95fb7bbc14d6e5ac755abb3)
- **rfxlamia/skillkit `screenwriter` (snippet only).**
  - Scope: short films of about 5–10 minutes (8–15 scenes), sluglines, action and dialogue, XML-tagged markdown output, and visual descriptions written for image generation.
  - Directory figures: 76 installs, repo about 104 stars, first seen 2026-02-18. — [skills.sh](https://www.skills.sh/rfxlamia/claude-skillkit/screenwriter)
  - The raw SKILL.md at `skills/screenwriter/` returned 404, so the contents were not read. The repo page under the name `claude-skillkit` shows an Apache-2.0 licence. — [repo](https://github.com/rfxlamia/claude-skillkit)
- **Deupaxx/EveryDay-Writer.** 39 stars, MIT, last push 2026-09-21. — [API](https://api.github.com/repos/Deupaxx/EveryDay-Writer)
  - "One root dispatcher, 13 writing sub-skills", with a voice-fingerprint system and anti-AI rules.
  - It claims script writing for "screenplay, TV, short film, YouTube, documentary, video essay, sketch, and short-form scripts with ... hooks, dialogue, pacing, and viewer retention". — [README](https://github.com/Deupaxx/EveryDay-Writer)
  - Individual SKILL.md files were not read.
- **anthropics/skills (official).** The `skills/` folder holds algorithmic-art, brand-guidelines, canvas-design, claude-api, doc-coauthoring, docx, frontend-design, internal-comms, mcp-builder, pdf, pptx, skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder, webapp-testing, xlsx and a few others. **There is no screenwriting, script or story skill.** — [anthropics/skills tree](https://github.com/anthropics/skills/tree/main/skills)

### Inferences
- jtydhr88 is the strongest drop-in for *craft*: structure, dialogue and sitcom punch-up.
  - It is text-only. Copy `sw-story-structure`, `sw-dialogue`, `sw-scene-craft` and `sw-sitcom-comedy` into `C:\LegoStudio\.claude\skills\` and you are done. It needs no Node or Python and works on Windows.
  - It was built for feature, TV and stage formats, not 1–5 minute explainers. The Chinese bodies of 24–38 KB per skill cost tokens on every load, although the "read only these sections" tables reduce that.
- Kishōtenketsu as such was not found in any skill; 起承转合 in `sw-story-structure` is the closest match.
- For a 1–5 minute comedic explainer, the useful parts are McKee's "every scene must turn a value" test, the sitcom setup, punchline and topper mechanics, and the cover-the-names dialogue test. Page-count and act-length rules do not transfer.

### Gaps
- No skill was found that explicitly implements **Dan Harmon's Story Circle**. It is not mentioned in the three jtydhr88 files read, and the searches turned up only general explainer articles. — [search: nofilmschool, celtx etc.](https://blog.celtx.com/what-is-kishotenketsu-defined/)
- The rfxlamia `screenwriter` SKILL.md and the Deupaxx sub-skills were not read. Their quality is unverified.
- The jtydhr88 claim of "47 craft books" with page citations was not checked for how much copyrighted text the reference.md files reproduce.

## 2. Per-item catalogue: URL, licence, stars, last push, contents, quality, Windows drop-in ease

### Takeaway
Of about 20 candidates, three repos are worth adopting as text-only reference skills: jtydhr88 (craft), papercut-explainer's script and hook skills (short-form spine and gags), and the `yt-script` / `yt-hook-scripter` files (hooks and retention). Several popular-looking entries have anomalous metadata or are stale.

### Cited Findings
Star and date figures come from the API on 2026-11-26 unless marked otherwise.

| Item | Licence | Stars | Last push | What it really contains | Quality / fit | Drop-in on Windows |
|---|---|---|---|---|---|---|
| [jtydhr88/screenwriting-skills](https://github.com/jtydhr88/screenwriting-skills) ([API](https://api.github.com/repos/jtydhr88/screenwriting-skills)) | MIT | 2,183 (snippets say ~1.8K) | 2026-11-24 | 27 Chinese-body skills: structure, dialogue, scene, sitcom comedy, workflow | High craft depth; long-form bias; token-heavy | Easy: copy folders, text only |
| [danjdewhurst/story-skills](https://github.com/danjdewhurst/story-skills) ([API](https://api.github.com/repos/danjdewhurst/story-skills)) | MIT | 453 | 2026-11-25 | ~28 fiction skills + JS/Bun CLI, evals | Well engineered; prose fiction, not scripts | Skills are copyable; the CLI is optional |
| [0xS4N4TG/papercut-explainer](https://github.com/0xS4N4TG/papercut-explainer) | MIT (with THIRD_PARTY exceptions) | 260 (page) | not visible (15 commits) | 9 skills (strategy, hook, script, storyboard, voice, build, QA) + Remotion library | Closest to the brief (short comedic explainer, Remotion) | Pipeline needs WSL; script and hook SKILL.md are usable as reference text |
| [jakeschincariol/youtube-agent-skill](https://github.com/jakeschincariol/youtube-agent-skill) ([API](https://api.github.com/repos/jakeschincariol/youtube-agent-skill)) | MIT | 7,498 (anomalous, see Q4) | 2026-09-16 (created the same day) | 11 skills; yt-script with 21 hook formulas + `hookscore.py`; yt-shorts | Concise, practical SKILL.md files | Needs `python3`; otherwise readable |
| [sergebulaev/youtube-skills](https://github.com/sergebulaev/youtube-skills) ([API](https://api.github.com/repos/sergebulaev/youtube-skills)) | MIT | 107 | 2026-11-25 | 9 skills incl. yt-hook-scripter; Python lib for Publora/Pixfaro/YouTube | Good hook file; marketing focus | Hook SKILL.md is text; the lib is networked |
| [AgriciDaniel/claude-youtube](https://github.com/agricidaniel/claude-youtube) ([API](https://api.github.com/repos/AgriciDaniel/claude-youtube)) | MIT | 875 | 2026-04-10 (stale) | One big skill + YouTube API/OAuth scripts, install.ps1 | Broad creator toolkit | Scripts need network and keys |
| [getatelier/youtube-skills](https://github.com/getatelier/youtube-skills) ([API](https://api.github.com/repos/getatelier/youtube-skills)) | MIT | 0 | 2026-05-14 (created the same day) | Same description as AgriciDaniel's repo | Likely copy | Skip |
| [aouellets/creator-studio](https://skills.lc/aouellets/creator-studio/aouellets-creator-studio-skills-youtube-script-writer-skill-md) `youtube-script-writer` | MIT (page) | unknown (API: "Moved Permanently") | unknown | Hook/body/payoff long-form script skill with timed pattern interrupts | Well-scoped; long-form 8–12 min default | Text, copyable |
| [vkorost/claude-standup-skills](https://github.com/vkorost/claude-standup-skills) | MIT (page) | not obtained | not obtained | 7 "style-<comedian>" skills | Voice imitation of real comedians | Text; poor fit |
| [Deupaxx/EveryDay-Writer](https://github.com/Deupaxx/EveryDay-Writer) ([API](https://api.github.com/repos/Deupaxx/EveryDay-Writer)) | MIT | 39 | 2026-09-21 | Dispatcher + 13 writing sub-skills incl. scripts | Unread sub-skills | Probably text |
| [DenisHumen/cinema-skills](https://github.com/DenisHumen/cinema-skills) ([API](https://api.github.com/repos/DenisHumen/cinema-skills)) | MIT | 19 | 2026-09-26 | Template only | Placeholder | n/a |
| [dandanthedan gist](https://gist.github.com/dandanthedan/6adc014dc95fb7bbc14d6e5ac755abb3) | none stated | n/a | 2026-05-01 | Hollywood-format screenplay skill + .docx tools | Feature-film oriented | Licence unclear |
| [rfxlamia screenwriter](https://www.skills.sh/rfxlamia/claude-skillkit/screenwriter) | Apache-2.0 ([repo page](https://github.com/rfxlamia/claude-skillkit)) | ~104 (skills.sh) | unknown | 5–10 min short-film screenplay for AI video | Unread (404) | Unknown |
| [mohitagw15856/pm-claude-skills](https://github.com/mohitagw15856/pm-claude-skills/blob/main/skills/youtube-script-writer/SKILL.md) ([API](https://api.github.com/repos/mohitagw15856/pm-claude-skills)) `youtube-script-writer` | MIT | 1,605 | 2026-11-25 | One of "1,310 professional Agent Skills" | Snippet only; mass-produced pack | Text |
| [cdeistopened/skill-stack](https://skills.lc/cdeistopened/skill-stack/cdeistopened-skill-stack-claude-skills-youtube-scriptwriting-skill-md) ([API](https://api.github.com/repos/cdeistopened/skill-stack)) `youtube-scriptwriting` | MIT | 30 | 2026-07-08 (stale-ish) | Checkpoint workflow + retention reference (per listing) | Snippet only; repo is now a Vite/Convex web app, skill path not found | Unknown |
| [jinbaozi/screenwriting-skills](https://github.com/jinbaozi/screenwriting-skills) ([API](https://api.github.com/repos/jinbaozi/screenwriting-skills)) | MIT | 0 | 2026-11-25 | Likely mirror of jtydhr88 | Skip | n/a |
| [bs779517/story-skills](https://crossaitools.com/skills/bs779517/story-skills/plot-structure) ([API](https://api.github.com/repos/bs779517/story-skills)) | MIT | 9 | 2026-10-14 (created 2021) | Story writing with YAML, plot-structure skill | Low signal | npx installer |

- **Directory-only listings, snippet only.** None of these were opened, and their "Grade A" labels are not quality evidence:
  - skillsdirectory: "Comedy Writing (Grade A)" (fabioc-aloha), "Joke Writing (Grade A)" (gwendall), "Joke (Grade A)" (sepivip), "Youtube Script Writer (Grade A)" (lionelsimai), "Scriptwriter (Grade A)" (nobodyonlyc). — [comedy-writing](https://www.skillsdirectory.com/skills/fabioc-aloha-comedy-writing); [joke-writing](https://www.skillsdirectory.com/skills/gwendall-joke-writing); [joke](https://www.skillsdirectory.com/skills/sepivip-joke); [youtube-script-writer](https://www.skillsdirectory.com/skills/lionelsimai-youtube-script-writer); [scriptwriter](https://www.skillsdirectory.com/skills/nobodyonlyc-scriptwriter)
  - mcpmarket: "Joke Crafter" (two-frame misdirection, comic engines), "YouTube Scriptwriter", "YouTube Script Writer". — [joke-crafter](https://mcpmarket.com/tools/skills/joke-crafter); [youtube-scriptwriter](https://mcpmarket.com/tools/skills/youtube-scriptwriter); [youtube-script-writer](https://mcpmarket.com/tools/skills/youtube-script-writer)
  - skills.lc: kousun12/semantic-algos "joke", coreycottrell/skills-hub "pbj-comedy". — [joke](https://skills.lc/kousun12/semantic-algos/kousun12-semantic-algos-skills-joke-skill-md); [pbj-comedy](https://skills.lc/coreycottrell/skills-hub/coreycottrell-skills-hub-skills-content-pbj-comedy-skill-md)
  - Others: haowjy/creative-writing-skills (Apache-2.0 per repo page) and smixs/creative-director-skill (CC-BY-4.0 per repo page; "ideation, scoring, recursive refinement, and storytelling frameworks"). — [haowjy](https://agentskill.work/en/skills/haowjy/creative-writing-skills); [smixs via BehiSecc list](https://github.com/BehiSecc/awesome-claude-skills)
- **Awesome lists.**
  - ComposioHQ/awesome-claude-skills and travisvn/awesome-claude-skills have no screenwriting entries. A grep of their READMEs for screen, script, story, comedy and YouTube found only YouTube-transcript and video-downloader tools. — [ComposioHQ README](https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/HEAD/README.md); [travisvn README](https://raw.githubusercontent.com/travisvn/awesome-claude-skills/main/README.md)
  - hesreallyhim/awesome-claude-code lists Story Skills (danjdewhurst), Book Factory (robertguss/claude-skills, nonfiction) and iart-ai/motion-skills, which has explainer and TikTok/Reels motion-graphics packs. — [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
  - BehiSecc/awesome-claude-skills lists papercut-explainer, story-skills, creative-director-skill, ecommerce-video-skills (hooks, storyboards, voice-overs) and the CreatorSkills marketplace. — [BehiSecc list](https://github.com/BehiSecc/awesome-claude-skills)
  - VoltAgent/awesome-agent-skills has nothing screenwriting-specific. The nearest entries are Nanako0129/sepia ("De-AI writing skill fixing narrative structure before word choice") and deanpeters/storyboard (product-manager storyboards). — [VoltAgent list](https://github.com/VoltAgent/awesome-agent-skills)

### Inferences
- **Recommended shortlist for LegoStudio.**
  1. jtydhr88: `sw-story-structure`, `sw-dialogue`, `sw-sitcom-comedy`.
  2. papercut-explainer: `papercut-script`, `papercut-hook` and `references/comedy.md`, used as reference text only.
  3. jakeschincariol `yt-script` and `yt-shorts`, plus sergebulaev `yt-hook-scripter`, for hook and retention rules. Copy the markdown only.
- The best approach is probably to write one project skill that adapts these rules to `script.json` output, rather than installing whole plugins.
- **Overlap with this session.** The session skill listing already includes `the-writer`, `the-script-architecture`, `the-script-qa`, `the-voice-dialogue`, `the-topic-selection` and `the-visual-script`, and an `01-showrunner` agent exists. New external skills could duplicate or conflict with these, so compare them before adding. (Source: the session skill and agent listing; not a web source.)

### Gaps
- Stars and last-push dates for vkorost, papercut-explainer, aouellets, haowjy, smixs and rfxlamia were not obtained because of the API rate limit.
- Search mentioned the skillsmp.com marketplace, but it was not browsed.
- Reddit r/ClaudeAI posts were not checked.

## 3. YouTube / explainer / Shorts-hook / retention and comedy-writing skills

### Takeaway
Several YouTube skills exist that cover hooks and retention. The most relevant to a 1–5 minute comedic explainer are:
- **papercut-explainer**: a 10-beat spine for 22–30 second vertical explainers, with a humour pass and a gag bank. It is built on Remotion.
- **jakeschincariol yt-script / yt-shorts**: hooks scored against 21 formulas, `[ON SCREEN]` per beat, and loop points for Shorts.
- **sergebulaev yt-hook-scripter**: 30-second long-form and 3-second Shorts hook formulas.

Dedicated comedy skills are either imitations of real stand-up comedians (vkorost) or unread directory listings. The best-sourced comedy mechanics are in jtydhr88 `sw-sitcom-comedy`.

### Cited Findings
- **papercut-explainer.** Its stated purpose is to "make short vertical explainer reels that look like layered construction paper". — [README](https://github.com/0xS4N4TG/papercut-explainer)
  - Skills: `papercut-explainer` (router), setup, strategy, hook, script, storyboard, voice, build and QA. It also ships a Remotion library with 24 backdrops, 17 camera moves, 10 transitions, 79 SFX and 8 music beds. — [README](https://github.com/0xS4N4TG/papercut-explainer)
  - **`papercut-script` (read).** It writes a 75–95 word script for 22–30 seconds at about 3.5–4 words per second, with a new set every 1.5–3 seconds. — [SKILL.md](https://raw.githubusercontent.com/0xS4N4TG/papercut-explainer/HEAD/skills/papercut-script/SKILL.md)
    - The 10 beats are: Hook (0–3 s), Proof/tension, Reframe, Name reveal, How it works, Escalation (a stack of exactly three), Peak, Catch (honest counterpoint), Payoff, CTA.
    - It runs three tracks: voiceover, banner (hard fact every 1.8–3 s) and set.
    - Every number must trace back to `research/facts.md`.
    - It includes a "humour pass", with gag and format banks in `references/comedy.md`.
  - Requirements: Node 20+, ffmpeg, rsync, Python 3.9+. It is tested on macOS, and the README says "Windows: use WSL".
  - It estimates about $14–19 in Claude API cost per 25–30 second reel. — [repo page via WebFetch](https://github.com/0xS4N4TG/papercut-explainer)
- **jakeschincariol `yt-script` (read, 2.7 KB).**
  - "The first 15 seconds is the whole job": confirm the click, open a question, prove the payoff exists.
  - Write five hooks against 21 formulas, score them with `hookscore.py`, and show the top two.
  - Shape: the turn at 0:15–0:45 (no channel intro), one idea per beat with `[ON SCREEN: ...]`, an explicit payoff, and one ask.
  - "Never invent a number, a result or a source."
  - It estimates runtime at 150 words per minute. — [SKILL.md](https://raw.githubusercontent.com/jakeschincariol/youtube-agent-skill/HEAD/skills/yt-script/SKILL.md)
  - `hookscore.py` is a regex heuristic scoring specificity, address, stakes, curiosity and brevity, with weights of 60% the mean plus 40% the weakest property.
  - Its own docstring says it "separates a creator's own hits from their own misses barely at all", based on 74 hooks. — [hookscore.py](https://raw.githubusercontent.com/jakeschincariol/youtube-agent-skill/HEAD/skills/yt-script/hookscore.py)
- **jakeschincariol `yt-shorts` (read).** It picks 20–55 second spans that open on a complete thought, contain a turn and end on a line.
  - It writes a new first line, on-screen text for the first two seconds, and a loop point "so the first line answers" the last. — [SKILL.md](https://raw.githubusercontent.com/jakeschincariol/youtube-agent-skill/HEAD/skills/yt-shorts/SKILL.md)
- **sergebulaev `yt-hook-scripter` (read, 6.5 KB).**
  - Formulas: Y7 Restate-and-Raise, Y8 Cold-Open Payoff Tease, Y9 Question-and-Contract, Y10 Shorts 3-Second Hook with a designed loop.
  - Line rules: 1 lands the promise, 2 raises the stakes, 3 is the watch contract.
  - It strips intros, adds a "humanizer pass" against AI vocabulary, and has a strict "never invent the specifics" rule.
  - It calls `lib/url_parser.py` if given a URL. — [SKILL.md](https://raw.githubusercontent.com/sergebulaev/youtube-skills/HEAD/skills/yt-hook-scripter/SKILL.md)
- **aouellets/creator-studio `youtube-script-writer` (read).** It is built on a hook/body/payoff architecture:
  - the retention cliff in the first 30 seconds
  - a mid-video sag fixed with mini-hooks and bridges
  - timed pattern interrupts derived from target length
  - B-roll cues inline
  - It explicitly routes Shorts openers to a separate `video-hook-writer` skill. — [SKILL.md](https://raw.githubusercontent.com/aouellets/creator-studio/HEAD/skills/youtube-script-writer/SKILL.md)
- **AgriciDaniel/claude-youtube.** Channel audits, SEO, "retention-engineered" scripts, five hook variants with drop-off risk ratings, and Shorts packages. Last push 2026-04-10, so it is stale. — [repo](https://github.com/agricidaniel/claude-youtube); [API](https://api.github.com/repos/AgriciDaniel/claude-youtube)
- **vkorost/claude-standup-skills.** Seven skills "for writing in the voice of" Carlin, Louis CK, Gervais, Hicks, Maher, Colin Quinn and Doug Stanhope, built to rotate comedic voices for daily news briefings. — [README](https://github.com/vkorost/claude-standup-skills)
- **ecommerce-video-skills (xianyu110).** "Ecommerce video skills for hooks, storyboards, voice-overs, and subtitles." Snippet only. — [BehiSecc list](https://github.com/BehiSecc/awesome-claude-skills)
- **iart-ai/motion-skills.** About 50 motion-graphics skills including explainers and TikTok/Reels. These are visual, not scriptwriting. — [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)

### Inferences
- For 1–5 minute landscape episodes plus Shorts, combine:
  - papercut's beat spine (scaled up), with its rules of an "honest catch" beat and one fact per banner
  - yt-script's "[ON SCREEN] on every beat" rule, which maps well to storyboard cues
  - the Shorts loop-point rule
  - sitcom topper and running-gag mechanics for character dialogue
- None of these skills handles **multi-character comedic dialogue** for explainers. They are all narrator or creator-voice. Dialogue craft would come from jtydhr88 `sw-dialogue` and `sw-sitcom-comedy`.

### Gaps
- `papercut-explainer/references/comedy.md` and `storytelling.md` were not read, so the quality of the gag bank is unverified.
- No dedicated, verified "punch-up" or joke-writing SKILL.md was read. The comedy listings on skillsdirectory and mcpmarket are snippet only.
- No skill was found that provides a **script critique rubric** for short comedic explainers specifically. jtydhr88 `sw-sitcom-comedy` section 12 (diagnostic checklist) is the closest, though it is written for sitcoms.

## 4. Red flags: scripts, network, prompt-injection-ish content, unclear licences, suspicious metadata

### Takeaway
The text-only skills (jtydhr88, the YouTube SKILL.md files read here, vkorost) carry low technical risk. The main risks are:
- skills that tell the agent to run Python (`python3` on Windows)
- bundled networked clients (YouTube OAuth, Publora, Pixfaro)
- a gist with no licence
- anomalous star counts and copy repos

### Cited Findings
- **jakeschincariol/youtube-agent-skill.**
  - `created_at` 2026-09-16T13:32:05Z and `pushed_at` 2026-09-16T13:32:08Z are three seconds apart, which means one push and no visible history, yet it shows 7,498 stars. Treat the star count as unverified; it is probably not a quality signal. — [API](https://api.github.com/repos/jakeschincariol/youtube-agent-skill)
  - Its skills ship six Python scripts (hookscore.py, retention.py, deadair.py, title.py, chapters.py, swipe.py). — [git tree](https://api.github.com/repos/jakeschincariol/youtube-agent-skill/git/trees/HEAD?recursive=1)
  - `yt-script` says "Two tools live in this folder and both actually run. Use them." and calls `python3 hookscore.py`. It also reads or writes `~/.claude/youtube/voice.md` in the user's home directory. — [SKILL.md](https://raw.githubusercontent.com/jakeschincariol/youtube-agent-skill/HEAD/skills/yt-script/SKILL.md)
- **getatelier/youtube-skills.** Same description as AgriciDaniel/claude-youtube, 0 stars, created and pushed on the same day. Likely a copy. — [API](https://api.github.com/repos/getatelier/youtube-skills)
- **AgriciDaniel/claude-youtube.** Ships `execution/fetch_channel_data.py`, `fetch_transcript.py`, `fetch_video_analytics.py`, `search_competitor_videos.py` and `utils/youtube_auth.py`, plus install.ps1 and install.sh. These need network access and YouTube API or OAuth credentials. — [git tree](https://api.github.com/repos/AgriciDaniel/claude-youtube/git/trees/HEAD?recursive=1)
- **sergebulaev/youtube-skills.** Its `lib/` holds `publora_client.py`, `pixfaro_client.py`, `youtube_client.py` and `_env.py`. That means third-party publishing services, network access and vendor promotion: the description says "Publish via Publora". It also ships its own `check_no_secrets.py`, `check_security_boundaries.py` and `check_untrusted_rule.py`. — [git tree](https://api.github.com/repos/sergebulaev/youtube-skills/git/trees/HEAD?recursive=1); [API description](https://api.github.com/repos/sergebulaev/youtube-skills)
- **papercut-explainer.** Running the full pipeline needs Node, ffmpeg, rsync and Python. It downloads a 2.3–4.2 GB local TTS model and Remotion's headless browser, and has no native Windows support. — [repo page](https://github.com/0xS4N4TG/papercut-explainer)
  - Its script skill expects web fetch or search for research. — [SKILL.md](https://raw.githubusercontent.com/0xS4N4TG/papercut-explainer/HEAD/skills/papercut-script/SKILL.md)
- **dandanthedan gist.** Includes `tools/` .docx generators (executable code), and no licence is visible. Gists carry no licence unless one is stated, so reuse rights are unclear. — [gist](https://gist.github.com/dandanthedan/6adc014dc95fb7bbc14d6e5ac755abb3)
- **danjdewhurst/story-skills.** Large JS/Bun tooling (`bin/story.js`, `skills/story-maintenance/scripts/story.js`, evals). Optional, but present. — [git tree](https://api.github.com/repos/danjdewhurst/story-skills/git/trees/HEAD?recursive=1)
- **DenisHumen/cinema-skills.** Has `scripts/install.ps1`, `install.sh` and `validate_skills.py`, but no real skills yet. — [git tree](https://api.github.com/repos/DenisHumen/cinema-skills/git/trees/HEAD?recursive=1)
- **jtydhr88.** The only script is the dev tool `tools/check-skills.py`. — [git tree](https://api.github.com/repos/jtydhr88/screenwriting-skills/git/trees/HEAD?recursive=1)
  - A keyword scan of five SKILL.md files (sw-sitcom-comedy, sw-story-structure, sw-dialogue, sw-workflow, sw-scene-craft) for "ignore previous", curl, wget, http(s)://, bash, python and allowed-tools found 0 hits. This was a keyword scan, not a security audit.
  - Content is distilled from copyrighted craft books with page citations (for example "Smith ... p0042"), under an MIT licence. Whether the reference.md files reproduce substantial copyrighted text was not checked. — [sw-sitcom-comedy SKILL.md](https://raw.githubusercontent.com/jtydhr88/screenwriting-skills/HEAD/plugins/screenwriting/skills/sw-sitcom-comedy/SKILL.md)
- **vkorost.** Its skills imitate the voices of named real comedians. That is a persona-imitation concern and off-brand for an original character series. — [README](https://github.com/vkorost/claude-standup-skills)
- **mohitagw15856/pm-claude-skills.** Advertises "1,310 professional Agent Skills", a mass-produced pack. Quality per skill is unknown. — [API](https://api.github.com/repos/mohitagw15856/pm-claude-skills)
- **bs779517/story-skills.** Created in 2021 but repurposed in 2026. Low stars, low signal. — [API](https://api.github.com/repos/bs779517/story-skills)

### Inferences
- The project's CLAUDE.md forbids installing skills, plugins, MCP servers or packages outside the approved list without asking. Any plugin-marketplace install, or any skill that runs Python or Node, therefore needs explicit user approval.
- Copying selected text-only SKILL.md files, or writing a project skill inspired by them, is the lowest-friction and lowest-risk route.
- The project uses `python` and Windows paths. Skills that hard-code `python3` and `~/` paths would need edits.
- The project's brand-safety and no-emoji rules mean that copied skills should be checked for emoji in their output templates. Some READMEs use emoji, for example cinema-skills.

### Gaps
- No full security review of any repo was done. Only file trees and a few SKILL.md files were inspected.
- Reproduction of copyrighted text in the jtydhr88 reference.md files was not checked.
- The `hooks.json` contents in jakeschincariol and the papercut reference files were not inspected.
