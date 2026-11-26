# Multi-agent and hierarchical LLM systems for story and screenplay generation (planning, critique, revision)

Research date: 2026-11-26. GitHub star counts, licence fields and `pushed_at` dates marked "(GH API)" were retrieved from the public GitHub REST API on 2026-11-26. Licence field meanings: "None" means GitHub found no licence file, which defaults to all rights reserved (ideas reusable, code not). "NOASSERTION" means a LICENSE file exists but GitHub could not classify it, so read the file before reuse.

## Dramatron (DeepMind): repo, licence, status, what is reusable

### Takeaway
Dramatron (2022 preprint, CHI 2023 paper) is the canonical "hierarchical prompt chaining" screenwriter: logline -> characters -> plot points -> locations -> dialogue. The repo is Apache-2.0, still public, not archived, but dormant since mid-2024. It ships with no LLM built in, so the chain is easy to port to Claude. What is worth reusing is the decomposition and the co-writing UX (human edits at every level), not the code.

### Cited Findings
- Repo: https://github.com/google-deepmind/dramatron. Apache-2.0, 1,150 stars, last push 2024-07-16, not archived. Description: "Dramatron uses large language models to generate coherent scripts and screenplays." (GH API) — [GitHub](https://github.com/google-deepmind/dramatron)
- Starting from a log line, Dramatron interactively generates character descriptions, plot points, location descriptions and dialogue — [GitHub README](https://github.com/google-deepmind/dramatron)
- The Colab ships without an LLM: users implement `__init__` and `sample` with their own model. Software is Apache 2.0, other materials CC-BY 4.0. It is "not an official Google product" — [GitHub README](https://github.com/google-deepmind/dramatron)
- Its outputs are meant as material for authors' "compilation, editing, and rewriting". One playwright staged four heavily edited and rewritten scripts — [GitHub README](https://github.com/google-deepmind/dramatron)
- Papers: Mirowski, Mathewson, Pittman, Evans, arXiv:2209.14958 (2022). CHI 2023 version: "Co-Writing Screenplays and Theatre Scripts with Language Models: An Evaluation by Industry Professionals", DOI 10.1145/3544548.3581225 — [GitHub README](https://github.com/google-deepmind/dramatron)
- The same DeepMind lead author (Mirowski) later ran comedy workshops with 20 professional comedians (Edinburgh Fringe, August 2023, plus online), published at ACM FAccT 2024. Conclusion: LLMs fell short as creativity-support tools for comedy, producing stereotyped and biased tropes — [arXiv 2405.20956](https://arxiv.org/abs/2405.20956); [DeepMind](https://deepmind.google/research/publications/70876/)

### Inferences
- Because the model is plugged in through two methods (`__init__`, `sample`), a Claude adapter is trivial. In practice it is cleaner to reimplement the five-level chain as five Claude calls with structured (JSON) outputs than to keep the Colab.
- The reusable idea is "each level conditions the next, and the human can edit any level before descending". For this studio that maps to: user outline -> logline/premise JSON -> cast JSON (link to `cast/*.json`) -> beat list JSON -> location/set list (link to `sets/*.json`) -> per-scene dialogue JSON.
- Dramatron is a 2022 design built for non-chat LLMs. It has no critic or revision loop, so the critique/revision part has to come from the later systems below.

### Gaps
- I did not read the full 2022 paper here, so the prompt-prefix details (e.g. the exact "title" step and the few-shot prefix sets) are not verified in this session.
- No maintenance activity after July 2024 was found. The README does not state whether the repo is officially deprecated.

## Other systems: URL, licence, stars/last update, core idea

### Takeaway
The 2022–2025 literature converges on three recurring ideas: (1) plan hierarchically before writing (Re3/DOC, StoryWriter, Agents' Room); (2) split roles into planner / writer / critic-editor / actor agents (HoLLMwood, IBSEN, FilmAgent, Agents' Room, CritiCS); (3) for film/animation, add downstream shot/scene planners that consume a structured script (FilmAgent, Anim-Director, MovieAgent, DreamFactory, MM-StoryAgent). Code availability and licences vary a lot. Several high-profile systems (Agents' Room, HoLLMwood) have no confirmed public code.

### Comparison table (GH API data retrieved 2026-11-26)

| System (year, venue) | Repo / link | Licence | Stars | Last push | Core idea |
|---|---|---|---|---|---|
| Dramatron (2022 / CHI 2023) | [google-deepmind/dramatron](https://github.com/google-deepmind/dramatron) | Apache-2.0 | 1,150 | 2024-07-16 | Hierarchical logline -> characters -> plot -> locations -> dialogue |
| Re3 (EMNLP 2022) | [yangkevin2/emnlp22-re3-story-generation](https://github.com/yangkevin2/emnlp22-re3-story-generation) | MIT | 257 | 2022-12-21 | Plan / Draft / Rewrite / Edit with recursive reprompting |
| DOC v1 (ACL 2023) | [yangkevin2/doc-story-generation](https://github.com/yangkevin2/doc-story-generation) | MIT | 161 | 2023-10-27 | Detailed hierarchical outline + controller |
| DOC v2 codebase | [facebookresearch/doc-storygen-v2](https://github.com/facebookresearch/doc-storygen-v2) (mirror [yangkevin2/doc-storygen-v2](https://github.com/yangkevin2/doc-storygen-v2), 1 star) | NOASSERTION (check LICENSE) | 94 | 2026-05-13 | Updated DOC codebase |
| MoPS (ACL 2024) | [GAIR-NLP/MoPS](https://github.com/GAIR-NLP/MoPS) | None | 47 | 2024-07-19 | Modular story premise synthesis |
| IBSEN (ACL 2024) | [OpenDFM/ibsen](https://github.com/OpenDFM/ibsen) | MIT | 61 | 2025-07-05 | Director agent + actor agents + player agent for drama scripts |
| HoLLMwood (Findings EMNLP 2024) | no code found ([arXiv 2406.11683](https://arxiv.org/abs/2406.11683)) | n/a | n/a | n/a | Writer + Editor feedback loop + Actors role-playing |
| CritiCS (EMNLP 2024) | [EMNLP-2024-CritiCS/Collective-Critics-for-Creative-Story-Generation](https://github.com/EMNLP-2024-CritiCS/Collective-Critics-for-Creative-Story-Generation) | MIT | 14 | 2025-01-10 | Persona critics + leader refine plan and text for creativity |
| Agents' Room (ICLR 2025, Google DeepMind) | code not confirmed ([arXiv 2410.02603](https://arxiv.org/abs/2410.02603v2)) | n/a | n/a | n/a | Orchestrator + planning agents + writing agents over a shared scratchpad |
| StoryWriter (arXiv June 2025) | [THU-KEG/StoryWriter](https://github.com/THU-KEG/StoryWriter) | None | 49 | 2025-06-18 | Outline agent -> planning agent -> writing agent with history compression |
| LongWriter (ICLR 2025) | [THUDM/LongWriter](https://github.com/THUDM/LongWriter) | Apache-2.0 | 1,882 | 2025-06-24 | 10,000+ word generation from long-context LLMs |
| FilmAgent (arXiv Jan 2025 / SIGGRAPH Asia 2024) | [HITsz-TMG/FilmAgent](https://github.com/HITsz-TMG/FilmAgent): URL now shows "VideoClaw" | MIT (VideoClaw page) | 1.9k (VideoClaw page) | news 2026-06-11 | Director / screenwriter / actor / cinematographer agents in 3D virtual spaces |
| Anim-Director (SIGGRAPH Asia 2024) | [HITsz-TMG/Anim-Director](https://github.com/HITsz-TMG/Anim-Director) | None | 267 | 2026-01-07 | LMM agents for controllable animation video generation |
| MovieAgent (2025) | [showlab/MovieAgent](https://github.com/showlab/MovieAgent) | None | 380 | 2025-03-26 | Multi-agent chain-of-thought planning for automated movie generation |
| MM-StoryAgent (2024) | [X-PLUG/MM_StoryAgent](https://github.com/X-PLUG/MM_StoryAgent) | Apache-2.0 | 311 | 2024-08-23 | Multimodal story video agent (no repo description returned) |
| Wordcraft (Google PAIR) | [PAIR-code/wordcraft](https://github.com/PAIR-code/wordcraft) | Apache-2.0 | 355 (page) | not shown | LLM-powered story editor with pluggable "operations" |

### Cited Findings
- **Re3** (Yang, Peng, Tian, Klein; EMNLP 2022; arXiv 2210.06774) targets stories over 2,000 words. It builds a structured plan (setting, characters, numbered outline) and generates passages by repeatedly feeding plan + story context into prompts ("recursive reprompting"). Modules: Plan, Draft, Rewrite, Edit — [arXiv 2210.06774](https://arxiv.org/abs/2210.06774v2); [ACL Anthology](https://aclanthology.org/2022.emnlp-main.296)
- **DOC** (arXiv 2212.10077; ACL 2023) adds a detailed outliner and a detailed controller (a FUDGE adaptation working token by token). It removed Re3's editing step, which the authors found did not significantly affect final story quality. Human evals vs Re3: +22.5% absolute plot coherence, +28.2% outline relevance, +20.7% interestingness — [arXiv 2212.10077](https://arxiv.org/pdf/2212.10077)
- **Agents' Room** (Huot, Amplayo, Palomaki, Jakobovits, Clark, Lapata; arXiv Oct 2024, rev. Mar 2025; ICLR 2025). A central orchestrator coordinates specialised agents grounded in narrative theory and merges their contributions into a shared scratchpad. Planning agents cover plot, character, setting and conflict, and writing agents draft prose. It introduced the "Tell Me A Story" dataset from expert writing workshops (drafting, review, revision rounds). Humans preferred its stories over end-to-end baselines. Fine-tuned agents beat zero-shot ones. The paper also proposes an LLM evaluator that correlates with human raters — [arXiv 2410.02603](https://arxiv.org/abs/2410.02603v2); [ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/hash/0fbc8a83d93dd8021a4dd8d2d34138eb-Abstract-Conference.html); [ICLR slides (Google DeepMind)](https://iclr.cc/media/iclr-2025/Slides/30214.pdf)
- **HoLLMwood** (Chen et al., Findings of EMNLP 2024). A Writer LLM, an Editor LLM that gives suggestions in an iterative feedback-revision loop, and Actor LLMs that role-play characters in first person. In ablations, both feedback-revision and role-playing improved screenplay quality. No official code found — [arXiv 2406.11683](https://arxiv.org/abs/2406.11683); [ACL Anthology](https://aclanthology.org/2024.findings-emnlp.474/)
- **IBSEN** (Han et al., ACL 2024; "TheatreMaker"). A director agent writes and checks the storyline, actor agents generate personalised lines as the drama script, and a player agent can interact without director control. The director does not pass the full script to the actors, which keeps plot control without removing agent autonomy. Code and prompts are released — [arXiv 2407.01093](https://arxiv.org/html/2407.01093v1); [ACL Anthology](https://aclanthology.org/2024.acl-long.88); [GitHub](https://github.com/OpenDFM/ibsen); [project page](https://opendfm.github.io/ibsen)
- **CritiCS** (Bae & Kim, EMNLP 2024). Plan-refinement stage (CrPlan): create a plan from a premise -> three persona critics (personas built from the story's themes) each propose a change -> a leader ranks the suggestions and applies the best -> repeat for several rounds -> an evaluator picks the final plan. The plan critics use three criteria: "Original theme and background setting", "Unusual story structure", "Unusual ending". Human evaluation showed better creativity and reader engagement while keeping coherence — [arXiv 2410.02428](https://arxiv.org/abs/2410.02428v1); [ACL Anthology](https://aclanthology.org/2024.emnlp-main.1046/)
- **StoryWriter** (Xia et al., THU-KEG, arXiv 2506.16445, June 2025). An outline agent produces event-based outlines. A planning agent details the events and assigns them to chapters. A writing agent compresses story history according to the current event and writes new content. It reports better quality and length than baselines and releases a dataset — [arXiv 2506.16445](https://arxiv.org/abs/2506.16445v1); [GitHub](https://github.com/THU-KEG/StoryWriter)
- **MoPS** repo description: "[ACL 2024] Code for 'MoPS: Modular Story Premise Synthesis for Open-Ended Automatic Story Generation'" — [GitHub](https://github.com/GAIR-NLP/MoPS)
- **LongWriter** repo description: "[ICLR 2025] LongWriter: Unleashing 10,000+ Word Generation from Long Context LLMs" — [GitHub](https://github.com/THUDM/LongWriter)
- **FilmAgent** (Xu, Wang, et al., arXiv 2501.12909, 22 Jan 2025, "work in progress"). It simulates directors, screenwriters, actors and cinematographers. Stages: idea development -> structured story outline; scriptwriting -> per-scene dialogue and character actions; cinematography -> per-shot camera setups. Agents use iterative feedback and revision to verify intermediate scripts and reduce hallucinations. Evaluated on 15 ideas across 4 aspects, human average 3.98/5, beating all baselines. FilmAgent on GPT-4o beat a single-agent o1 setup — [arXiv 2501.12909](https://arxiv.org/abs/2501.12909)
- The `HITsz-TMG/FilmAgent` URL now serves "VideoClaw", an "AI director system" (MIT, ~1.9k stars, latest news 2026-06-11). It stores each storyboard as `storyboard.json` and lists FilmAgent and Anim-Director as related SIGGRAPH Asia 2024 works — [GitHub](https://github.com/HITsz-TMG/FilmAgent)
- **Anim-Director** repo description: "Controllable Animation Video Generation with Large Models-based Multimodal Agents". **MovieAgent**: "Automated Movie Generation via Multi-Agent CoT Planning" — [Anim-Director](https://github.com/HITsz-TMG/Anim-Director); [MovieAgent](https://github.com/showlab/MovieAgent)
- **DreamFactory** is known here only secondhand: MAViS (arXiv 2508.08487) cites it as Xie et al. 2024, using a hierarchical script -> scene -> shot pipeline, agentic but with no shot-design or audio component. MAViS itself is a multi-agent long-video storytelling framework (script writing, shot design, character modelling, keyframes, animation, audio) — [MAViS arXiv 2508.08487](https://arxiv.org/html/2508.08487v5)
- **Wordcraft** (Google PAIR) is an LLM-powered short-story editor. Its `/app/core/operations` folder "defines how the user's intent is combined with the document state" — [GitHub](https://github.com/PAIR-code/wordcraft)

### Inferences
- Code you can copy and adapt under permissive licences: Dramatron (Apache-2.0), Re3/DOC v1 (MIT), IBSEN (MIT), CritiCS (MIT), LongWriter (Apache-2.0), MM-StoryAgent (Apache-2.0), Wordcraft (Apache-2.0). StoryWriter, MoPS, MovieAgent and Anim-Director have no licence file, so only their ideas should be reused. Their prompts and code should not be copied into this repo.
- FilmAgent is the closest analogue to this project (LLM agents producing a structured script that drives a 3D virtual scene with cameras). Its three-stage split (outline -> scene dialogue + actions -> shot/camera) matches "storyboard.json -> director bakes timeline". The difference: here cameras and motion are computed deterministically by `packages/director`, so the LLM should only emit symbolic shot intent (preset names), never camera numbers.
- DOC's result (a detailed outline gives big coherence gains while the edit pass adds little) argues for spending tokens and effort on the beat sheet / outline stage rather than on polishing passes after drafting.
- Most of these systems target long prose (2,000–10,000+ words). This studio's videos (~1–3 minutes, comedy explainer) are much shorter, so the deeper hierarchy levels (chapters, history compression) can be collapsed. Role separation and critique loops still apply.

### Gaps
- **ScriptAgent**: no verified repo or paper. A guessed `Lightricks/ScriptAgent` lookup hit a rate limit, so existence is unconfirmed.
- **DreamFactory**: the guessed `AIRI-Institute/DreamFactory` returned 404. Details come only from MAViS's description. Primary paper/repo not verified.
- **Agents' Room** and **HoLLMwood**: no public code found or confirmed.
- **FilmAgent collaboration-strategy names** (e.g. "Critique-Correct-Verify", "Debate-Judge"): not mentioned on the arXiv abstract page or the current repo page. They are unverified and the full paper was not read.
- **MoPS module details** and **LongWriter's AgentWrite plan-then-write pipeline**: only the repo descriptions were verified. Internal method details are from recall and unverified here.
- **Wordcraft** paper/year and exact operation list (continue, elaborate, rewrite, etc.) not found on the repo page. Last-activity date not shown.
- **NovelCrafter-style tools** (commercial "codex / story bible + scene beats" apps) and generic open-source "AI screenwriter" GitHub apps were not researched within the tool budget.
- **MM-StoryAgent** repo returned no description, so its method was not verified.
- A GitHub API rate limit (60 req/h unauthenticated) blocked further metadata lookups (e.g. EQ-Bench creative-writing repo).

## Evaluation and critique: rubrics, LLM-as-judge, comedy-specific research

### Takeaway
Rubric design matters more than having an LLM judge at all. Binary, checklist-style tests (TTCW) and pairwise "duels" (HumorRank) are more reliable than absolute scores. 2023-era LLM judges did not correlate with expert creativity assessments. Humor judgments by LLMs are sensitive to prompt wording. Comedy research consistently finds LLM jokes generic and trope-heavy, and some 2025 evaluations place LLM humor around low- to mid-tier humans.

### Cited Findings
- **TTCW, "Art or Artifice?"** (Chakrabarty, Laban, Agarwal, Muresan, Wu; arXiv Sept 2023; CHI 2024): 14 binary tests across the four Torrance dimensions (fluency, flexibility, originality, elaboration), built on the Consensual Assessment Technique. Ten creative writers assessed 48 stories. LLM stories passed 3–10x fewer tests than professional ones (9% ChatGPT up to 30% Claude, 2023-era models: GPT-3.5/GPT-4/Claude 1.3). None of the LLMs, when used as TTCW judges, correlated positively with experts — [arXiv 2309.14556](https://arxiv.org/abs/2309.14556v3)
- **CritiCS creativity criteria** for plans: original theme/setting, unusual structure, unusual ending — [arXiv 2410.02428](https://arxiv.org/html/2410.02428v1)
- **Agents' Room** proposes an LLM-based evaluator that correlates with human raters on its long-form fiction task — [arXiv 2410.02603](https://arxiv.org/abs/2410.02603v2)
- **DOC** human-eval axes: plot coherence, outline relevance, interestingness — [arXiv 2212.10077](https://arxiv.org/pdf/2212.10077)
- **FilmAgent** human eval: 4 aspects on a 1–5 scale over 15 ideas — [arXiv 2501.12909](https://arxiv.org/abs/2501.12909)
- **HumorRank** (2026 preprint): models write jokes on shared prompts, a judge picks winners in pairwise duels, converted to Bradley–Terry ratings. The judge uses a General Theory of Verbal Humor (GTVH) rubric tagging mechanism, delivery and failure modes. Judges from two model families agreed strongly (Kendall tau = 0.889) — [arXiv 2604.19786](https://arxiv.org/html/2604.19786)
- **Oogiri humor evaluation** (AAAI-26): crowd annotators rated LLM outputs on six dimensions. Generation ability roughly matched low- to mid-tier humans (Gemini 2.5 Pro highest), and LLM judges weighted criteria such as novelty differently from humans — [AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/40567/44528); [arXiv 2511.09133](https://arxiv.org/pdf/2511.09133v1)
- **AACL 2026 judge-reliability study**: LLM humor judgments are sensitive to prompt wording and context. It builds a 600-sample challenge set to test this instability — [ACL Anthology](https://aclanthology.org/2026.aacl-long.126.pdf)
- **HumorBench** (2025): cartoon-caption comprehension. The model explains the joke and an autograder checks for required elements. It measures understanding, not taste — [arXiv 2507.21476](https://arxiv.org/html/2507.21476)
- **Loakman et al. 2025**: a 600-joke dataset (puns, Reddit jokes, topical humor) evaluating joke explanations with humans, automatic metrics and an LLM judge — [arXiv 2507.13335](https://arxiv.org/html/2507.13335v1)
- **"A Robot Walks into a Bar"** (Mirowski, Love, Mathewson, Mohamed; FAccT 2024): comedians found LLM output stereotyped and generic, rarely surprising. Instruction-tuned models refuse edgy material that would be normal in comedy clubs. Some comedians saw value in drafting a basic show structure — [arXiv 2405.20956](https://arxiv.org/abs/2405.20956); [heise](https://heise.de/en/news/Stand-up-comedy-LLMs-don-t-write-good-jokes-9778539.html)

### Inferences
- A Claude critic should use binary checklist items (pass/fail with a one-line reason) modelled on TTCW, plus pairwise comparison between candidate drafts or jokes (HumorRank style). It should not use a 1–10 score, since the evidence above says absolute LLM scores are unreliable and prompt-sensitive.
- For humor specifically: generate several punchline variants per beat, have a judge pick winners pairwise with a GTVH-style rubric (script opposition / mechanism / target / delivery / failure-mode tag), and keep a human (the user) as the final tie-breaker. The LLM judge should not be the only gate.
- Comedy critics need an explicit "anti-trope / anti-generic" check, given the repeated finding that LLM jokes are generic and stereotyped.
- Story-level checklist candidates for this studio, drawn from the axes above: outline relevance (does each scene serve a beat?), plot coherence (no contradictions with the earlier beats or cast sheet), character consistency (voice matches the `cast/*.json` persona), surprise (at least one unexpected turn or ending per CritiCS), humor density, and clarity of the explanation (domain-specific, uncited).

### Gaps
- No peer-reviewed rubric specific to short comedic explainer videos was found.
- Agents' Room's exact evaluator dimensions, and the correlation figure, were not read.
- Popular community benchmarks (EQ-Bench Creative Writing v3, LitBench, WritingBench) were not verified in this session because of the tool budget and rate limit.
- Punch-up / joke-rewriting systems (e.g. Witscript, Oogiri "Creative Leap-of-Thought") were not verified here.
- Full papers for the 2025–2026 humor work were not read. The numbers above come from abstracts and search summaries.

## Which patterns are worth copying into a Claude-based pipeline (user outline -> full screenplay -> dialogue lines JSON)

### Takeaway
Copy a Dramatron/DOC-style hierarchical plan (invest most in a detailed beat outline), FilmAgent/Agents' Room role separation (orchestrator, planner, writer, critic), CritiCS-style persona critics with a leader that applies one change per round, HoLLMwood/IBSEN-style actor role-play for dialogue, and TTCW/HumorRank-style binary and pairwise critique. Gate everything with schema validation and deterministic, non-LLM checks. "Retention hooks every N seconds" has no research backing in the sources found. Treat it as a craft heuristic.

### Cited Findings
- Hierarchical decomposition logline -> characters -> plot -> locations -> dialogue, with human editing at each level — [Dramatron](https://github.com/google-deepmind/dramatron)
- A detailed outline plus controller improved plot coherence +22.5%, outline relevance +28.2% and interestingness +20.7% over Re3. Dropping the edit pass did not significantly hurt quality — [DOC arXiv 2212.10077](https://arxiv.org/pdf/2212.10077)
- Orchestrator + specialised planning agents (plot, character, setting, conflict) + writing agents over a shared scratchpad beat end-to-end baselines in human preference — [Agents' Room](https://arxiv.org/abs/2410.02603v2)
- Writer/Editor feedback-revision and Actor role-play each improved screenplay quality in ablations — [HoLLMwood](https://arxiv.org/abs/2406.11683)
- The director checks the storyline and withholds the full script from actor agents, who generate their own lines — [IBSEN](https://arxiv.org/html/2407.01093v1)
- Three theme-based persona critics propose changes, a leader picks and applies the best, repeat, then an evaluator selects the final plan — [CritiCS](https://arxiv.org/abs/2410.02428v1)
- Outline agent -> planning agent (assign events to chapters) -> writing agent with compressed history — [StoryWriter](https://arxiv.org/abs/2506.16445v1)
- Film crew roles (director, screenwriter, actor, cinematographer) with iterative feedback to verify intermediate scripts. Multi-agent GPT-4o beat single-agent o1 — [FilmAgent](https://arxiv.org/abs/2501.12909)
- Pairwise duels with a GTVH rubric gave stable humor rankings across judge families — [HumorRank](https://arxiv.org/html/2604.19786). LLM humor judgments are prompt-sensitive — [AACL 2026](https://aclanthology.org/2026.aacl-long.126.pdf). LLM TTCW judges did not correlate with experts — [TTCW](https://arxiv.org/abs/2309.14556v3)

### Inferences
Proposed pipeline (design inference built from the findings above, not a published system):
1. **Premise/logline stage (Planner).** User outline -> `premise` JSON: logline, comedic angle, target length, explanatory goal. Optional MoPS-style variety: generate 3 premises and let the user pick (MoPS idea only; no licence, so no code reuse).
2. **Cast + setting stage.** Pick from existing `cast/*.json` and `sets/*.json` rather than inventing new ones (Dramatron levels 2 and 4, but grounded in the asset catalog so every character and location is renderable).
3. **Beat sheet stage (most effort, per DOC).** A numbered beat list, each beat with: purpose (setup / complication / reveal / payoff / explanation), estimated seconds, characters, location, joke mechanism, and the "card" content (fact or chart). Beat-level constraints such as "a hook in the first 3–5 s", "a turn or joke every ~10–20 s" and "a callback at the end" are craft heuristics. No source in this research validates specific N-second intervals, so they should be tunable constants rather than presented as research-backed.
4. **Plan critique loop (CritiCS).** Three persona critics, for example (a) comedy writer: trope/genericness check and surprise; (b) explainer editor: clarity and accuracy of the explanation; (c) continuity/cast critic: character voice, plus whether each scene is renderable with the existing sets. Each proposes one change. A leader applies the single best change per round, for 2–3 rounds max. Binary checklist outputs, no 1–10 scores (TTCW, AACL findings).
5. **Scene writing stage (Writer + Actors).** Write each scene from its beat. For dialogue, optionally use HoLLMwood/IBSEN-style actor role-play: each character agent sees only its persona plus the scene goal, not the full script, and the director/writer merges and trims. This pushes distinct voices. It costs more calls, so use it selectively (e.g. only for scenes with 2+ speaking characters).
6. **Joke punch-up (pairwise).** For each beat's punchline, generate 3–5 variants and choose by pairwise duels with a GTVH-style rubric (HumorRank). Surface the top 2 to the user when confidence is low, since LLM humor judges are unstable and comedy research finds LLM jokes generic.
7. **Light revision pass only (DOC).** One targeted revision addressing failed checklist items, not open-ended "make it better" rewrites, since DOC found the edit pass added little.
8. **Dialogue lines JSON + deterministic gates.** The final stage emits dialogue/script JSON validated by zod in `packages/shared` (project rule: AI only emits JSON, checked before write and after read). Non-LLM gates then run: schema validity, brand-safety word filter (no "lego"/"duplo"), subtitle length per line, total duration vs. target, and every `cast`/`set` ID existing in the catalog. Shot intent should be symbolic (preset names), with camera, motion and lip-sync computed by `packages/director` (FilmAgent's cinematographer role maps to deterministic code here, not to an LLM).
- **Orchestration with Claude.** An Agents' Room-style orchestrator with a shared scratchpad maps naturally onto one orchestrating Claude call plus role-specific subcalls whose outputs are JSON fragments merged into the scratchpad (the episode's JSON files). Keeping each role's context minimal (IBSEN: actors do not see the full script) also controls token cost.
- **Human-in-the-loop checkpoints** at premise choice, beat sheet approval and punchline choice follow Dramatron's co-writing finding (professionals heavily edited outputs) and the comedy findings (comedians value LLMs mainly for structure).

### Gaps
- No source evaluated "retention hooks every N seconds" or YouTube-retention-oriented script structure. Any interval must be tuned empirically, for example against the channel's own audience-retention analytics.
- No study compares the cost and quality of these multi-agent patterns using Claude models specifically. Most results are on GPT-4/4o, Gemini or fine-tuned open models.
- Whether actor role-play helps very short comedic dialogue (vs. long screenplays in HoLLMwood) is untested in the sources found.
- No source was found on Vietnamese-language screenplay or humor generation quality.
