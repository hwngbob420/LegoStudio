# MASTER ADD: LEGO STUDIO ENGINE (v1.0 — phương án C "lai")

Tài liệu thiết kế đầy đủ. Luật cứng luôn áp dụng nằm ở `CLAUDE.md`. Claude Code chỉ đọc mục cần cho giai đoạn đang làm.
Mô hình làm theo: `C:\pixel-story-engine` (gọi tắt **PSE**): cùng quy trình 6 bước, Studio 5 tab, kho 2 tầng, AI chỉ viết JSON,
làm từng giai đoạn có cửa kiểm. Khác PSE ở chỗ: hình là **3D gạch nhựa** chứ không phải pixel 2D.

---

## 1. Bức tranh sản phẩm

**Lego Studio Engine** là ứng dụng web chạy trên máy (Windows). Nó biến một đoạn truyện chữ thành video giải thích hài hước phong cách
mô hình gạch: minifigure 3D có **gương mặt 2D vẽ tay**, bộ set gạch không logo, chữ và biểu đồ kiểu sách hướng dẫn lắp ráp.

### Nguyên tắc cốt lõi
1. **Đạo diễn và Máy chiếu tách bạch.** AI chỉ viết JSON (kịch bản, bảng tài nguyên, storyboard). Code cố định lo hình, chuyển động, âm thanh, xuất video.
2. **Một bộ đạo diễn, hai máy chiếu (phương án C).**
   - `packages/director` (TypeScript, thuần logic, có test) đọc `storyboard.json` + mốc giờ và **nướng** ra `baked_timeline.json`.
     Nội dung: mỗi khung hình ghi tư thế khớp từng nhân vật, vị trí gốc, ô mặt (mắt và miệng), camera (vị trí, hướng, tiêu cự, khẩu độ, điểm lấy nét),
     gạch nào hiện hay ẩn, hiệu ứng nào bật.
   - **Máy chiếu xem trước:** Three.js trong Remotion (`@remotion/three`), chạy tức thì trong Player của Studio.
   - **Máy chiếu bản cuối:** Blender 5.2 EEVEE trên GPU, giữ nguyên chất hình hiện tại.
   - Hai máy chiếu chỉ phát lại timeline đã nướng, không tự tính chuyển động, nên không thể lệch nhau về bố cục và nhịp.
3. **Tài nguyên dựng một lần, dùng hai nơi.** Blender dựng minifig và bộ set bằng code (như hiện tại) rồi xuất `.glb` cùng `manifest.json`
   (mốc đứng, khớp xương, tâm đầu) vào kho. Three.js đọc chính các `.glb` đó.
4. **Kho 2 tầng.** Kho kênh (diễn viên, bộ set, gương mặt, ánh sáng dùng nhiều tập) và kho tập (đồ riêng). Có nút **Lưu sang kho kênh**.
5. **Nhịp stop-motion.** Thế giới 3D chạy 12 hình/giây (on twos), giao video 60 hình/giây; chữ và biểu đồ Remotion mượt 60.
6. **Tất định.** Không ngẫu nhiên thật, không đọc giờ hệ thống trong `packages/director` và `apps/video-engine`.
7. **An toàn thương hiệu.** Núm gạch trơn, không logo, không chữ thương hiệu trong bất kỳ khung hình nào.

---

## 2. Thiết lập Claude Code
Giống PSE mục 2.1:
- `CLAUDE.md` (luật cứng, tiếng Việt), `docs/MASTER_ADD.md`, `docs/PROGRESS.md`.
- `.claude/settings.json`: hook và chặn đọc `.env`.
- `.claude/hooks/check-rules.mjs`, chặn:
  - `Math.random`, `Date.now`, `new Date`, `performance.now` trong `packages/director` và `apps/video-engine`;
  - emoji Unicode;
  - chữ thương hiệu trong `locales/` và các component video.
- `.claude/agents/visual-qa.md`.
- `.claude/skills/phase-gate/`.

Giữ lại 5 agent hiện có (01-showrunner đến 05-motion-editor) cho việc làm tập bằng Claude, cập nhật đường dẫn theo cấu trúc mới.
Chỉ cài skill chính chủ: Remotion (`remotion-dev/skills`) và Gemini (`google/skills` → `gemini-api`). Muốn cài thêm thì hỏi trước.

---

## 3. Công nghệ

| Thành phần | Công nghệ | Ghi chú |
| :--- | :--- | :--- |
| Monorepo | npm workspaces, Node >= 20, TypeScript | Giống PSE |
| Studio | React + Vite + TS + Tailwind + Lucide + `@remotion/player` + `@xyflow/react` + `elkjs` | Chép khung từ PSE |
| Đạo diễn | `packages/director` (TS thuần) | Chuyển từ `acting_library.py`, `stage_compiler.py` (camera, mặt, lip-sync, lắp ráp) |
| Xem trước 3D | `@remotion/three` + `three` + `@react-three/fiber` | Đọc `.glb` + `baked_timeline.json` |
| Lớp chữ | Remotion (`remotion_studio` hiện tại) | Thẻ STEP, part callout, biểu đồ gạch, mũi tên, phụ đề |
| Bản cuối 3D | Blender 5.2 EEVEE, chạy `-b --factory-startup` | Engine Python hiện có, đổi sang phát timeline đã nướng |
| Server | Express + TS + `zod` | Phục vụ `workspace/`, chạy việc nền (Blender, Remotion) có tiến trình |
| AI chữ | Cổng AI của PSE (Gemini + OpenAI-compat/Ollama dự phòng) | Model lấy từ `.env` |
| Nhận file outline | `multer@2.5.0`, `mammoth@1.13.0` (.docx), `unpdf@2.2.2` (.pdf, cần Node 24+), `file-type@22.3.0`; `@types/multer` (dev) | Người dùng duyệt 2026-11-26. Ghim đúng bản (bản cũ có lỗi bảo mật) |
| Giọng | Nạp giọng + Whisper (`@remotion/install-whisper-cpp`), TTS chạy trên máy, SAPI dự phòng | Lip-sync chung một đường |
| Âm thanh | `audio_design.py` hiện có (tiếng clack, nhạc nền, hạ nhạc khi có lời) | Sau có thể chuyển sang TS |
| Ghép | FFmpeg | Ghép hình nền 12 hình/s giữ 5 lần thành 60 hình/s, lớp chữ VP9 alpha, tiếng |

---

## 4. Quy trình 6 bước (như PSE, bản 3D)

1. **Nạp truyện & bóc tách tài nguyên:** dán truyện, chọn không khí và khuôn tập. AI trả về `script.json` (lời thoại sạch) và `asset_plan.json`
   (diễn viên, bộ set, đạo cụ; gắn nhãn `channel` hoặc `episode`).
2. **Xưởng:** ráp minifig (da, tóc, áo in, quần, phụ kiện, chi tiết mặt, giọng) và xoay 3D ngay. Chọn bộ set, đặt mốc đứng. Nút **Lưu sang kho kênh**.
3. **Giọng & mốc giờ:** nạp giọng, TTS hoặc SAPI. **Tự khớp giờ** bằng Whisper, sửa tay từng câu. Khẩu hình 2D tự sinh.
4. **AI đạo diễn:** AI viết `storyboard.json` theo lô. Chỉ được dùng ID có thật trong kho, truyền dạng enum trong schema.
   Validator kiểm schema và luật **không che mặt**, lỗi thì tự gọi AI sửa.
5. **Xem trước & sửa nhanh:** Player Three.js + lớp chữ, khớp tiếng. Sửa thẻ cảnh là thấy ngay, không gọi lại AI.
   Nút **Kiểm khung** chạy contact sheet bằng Blender (~10 giây).
6. **Xuất bản:** nướng timeline, Blender render chia chặng, Remotion lớp chữ, trộn tiếng một lần, ghép ra `output.mp4`. Render lại được riêng chặng lỗi.

---

## 5. Giao diện Studio (6 tab, chép khung PSE; tab Duyệt block thêm ở Gđ 5C)
Nền tối, Lucide, chỉ báo `Đã tự lưu`, ô chọn tập và nút `Tập mới`.
- **Tab 1 — Kịch bản & Kế hoạch:** ô dán truyện, không khí, khuôn tập, ô **Góc nhìn của tôi**, nút `Phân tích bằng AI`; thẻ kịch bản sạch, thẻ bảng tài nguyên.
- **Tab 2 — Xưởng:** không gian kéo thả dạng nút như PSE mục 5.1, gồm nhóm Định hướng, Diễn viên, Bộ set & đạo cụ, Âm thanh, Chương/Cảnh.
  Ngăn chỉnh sửa có hai phần:
  - **Ráp minifig** với ô xem 3D xoay được;
  - **Bộ set** với danh sách mốc đứng và nút xem lắp ráp từng bước.
- **Tab 3 — Giọng đọc & Mốc giờ:** giống PSE Tab 3.
- **Tab 4 — Đạo diễn & Xem trước:** Player 16:9 (Three.js + lớp chữ), thanh thời gian có vạch cảnh, nút `AI tạo Storyboard`, dãy thẻ cảnh.
  Bảng sửa thẻ cảnh gồm:
  - bộ set, ánh sáng;
  - góc máy (`assembly_high` / `wide_establish` / `mcu` / `ecu` / `two_shot`), vùng chủ thể (1/3 trái, giữa, 1/3 phải), chuyển động máy;
  - diễn viên: mốc đứng, động tác, biểu cảm;
  - hiệu ứng, thẻ chữ.
  Thẻ có lỗi hiện viền đỏ kèm lý do. Nút `Kiểm khung` ra contact sheet.
- **Tab 5 — Xuất bản:** ngôn ngữ phụ đề, chất lượng (bản nhanh 960x540 hoặc bản chính 1920x1080), độ dài chặng, tiến trình từng chặng,
  `Render lại chặng này`, `Mở thư mục chứa video`.

---

## 6. Cấu trúc thư mục

```text
LegoStudio/
├── CLAUDE.md, docs/, .claude/, .env.example, start.bat
├── package.json                    # npm workspaces
├── packages/
│   ├── shared/src/                 # schemas.ts (zod), types.ts, constants.ts, timeref.ts
│   └── director/src/               # baker: acting, camera, faces, lipsync, assembly -> baked_timeline
├── apps/
│   ├── studio-ui/                  # React + Vite (chép khung PSE)
│   ├── server/src/                 # Express: dự án, kho, việc nền, AI, khớp giờ, xuất bản
│   ├── video-engine/src/           # Remotion: Overlay (lớp chữ) + PreviewScene (Three.js)
│   └── brick-engine/               # Python + Blender (engine hiện có), để phẳng để import đơn giản
│       ├── paths.py                # nơi DUY NHẤT khai báo đường dẫn
│       ├── brick_builder, sets_library, minifig_builder, look_dev, fx_library   # dựng tài nguyên
│       ├── stage_compiler.py       # phát timeline trong Blender (contact, render)
│       ├── tts_sapi, lipsync_2d, audio_design, master_compositor, qa_frames, produce
│       └── tools/                  # lookdev_test, set_preview, studio_doctor, compare_contact
└── workspace/
    ├── channel_library/
    │   ├── catalog.json            # danh mục kho kênh (thay catalog_manifest.json)
    │   ├── cast/{id}.json          # công thức minifig
    │   ├── sets/{id}.json          # đăng ký bộ set: ánh sáng, mốc, ghi chú
    │   ├── faces/                  # face_atlas_spec.json + script vẽ atlas
    │   ├── lighting/, palette.json
    │   └── baked/                  # .glb + manifest.json + atlas png (nướng lại được, không commit)
    └── projects/{ep_id}/
        ├── project.json, raw_story.txt, script.json, asset_plan.json
        ├── timing.json, storyboard.json, canvas.json, locales/{lang}.json
        ├── baked_timeline.json     # do director sinh, không sửa tay
        ├── voice/, chunks/, frames/ (không commit)
        └── output.mp4, contact_sheet.jpg, qa_frames/
```

---

## 7. Chuẩn dữ liệu (chi tiết chốt ở Giai đoạn 0 và 1A)

### 7.1. Đơn vị & trục
- 1 núm = 0,08 m (gấp 10 lần thật). Blender: Z lên trên. glTF/Three.js: Y lên trên (bộ xuất glTF tự đổi trục).
  `baked_timeline` ghi theo trục Blender; máy chiếu Three.js đổi trục ở **một** hàm duy nhất.
- Thời gian trong storyboard: giây hoặc mốc tham chiếu (`L2.w3`, `S1.t1`, `END`, có `+/-`). Trong `baked_timeline`: số khung 12 hình/s, bắt đầu từ 1.

### 7.2. `storyboard.json` (thay `episode_shotlist.json`)
Giữ nguyên các trường đang chạy tốt của shotlist hiện tại: `sets`, `cast`, `shots[]` với `t0/t1`, `subjects`, `camera{preset,move,yaw,lens,fstop,distance}`,
`subject_zone`, `ui_safe_zone`, `key_t`, `assembly`, `actors{id:{appear,acts[],expr[]}}`, `fx[]`, `ui[]`, `sfx[]`.
Thêm `id` ổn định cho mỗi cảnh, `summary`, `chapter`. Mọi ID diễn viên, bộ set, động tác, biểu cảm, hiệu ứng là enum lấy từ `catalog.json`.

### 7.3. `manifest.json` của tài nguyên nướng
- **Diễn viên:** tên node từng khớp (`root, hips, torso, head, arm.L, arm.R, hand.L, hand.R, leg.L, leg.R`), vị trí nghỉ của khớp, tâm đầu, hộp bao đầu.
- **Bộ set:** mốc đứng (vị trí + hướng), tâm set, danh sách nhóm gạch theo bước lắp ráp.
- Khớp xuất dưới dạng **node lồng nhau** (không skinning), vì minifig là các mảnh cứng.

### 7.4. `baked_timeline.json`
```json
{ "fps": 12, "frames": 234,
  "actors": { "max_dev": { "root": [[x,y,z,rotZ]...], "joints": { "arm.R": [[rx,ry,rz]...] }, "face": [[eye,mouth]...] } },
  "cameras": [ { "shot": "S1", "f0": 1, "f1": 29, "keys": [[x,y,z,rx,ry,rz,lens,fstop,focus]...], "shift": [sx,sy] } ],
  "assembly": { "Set_BrickCreatorDesk": [ { "group": 3, "showAt": 7, "drop": [[dz]...] } ] },
  "fx": [ { "kind": "sweat_drop", "f0": 200, "f1": 234, "anchor": [x,y,z], "size": 0.04 } ] }
```
Mảng chỉ ghi khi giá trị đổi (nén theo khung thay đổi) để file nhỏ.

### 7.5. Validator storyboard
Kiểm schema zod và ID có thật. Kiểm luật **không che mặt**: hộp đầu (tính từ `baked_timeline` và `manifest`) không được chạm vùng thẻ chữ đang hiện
ở bất kỳ khung mẫu nào, cũng không chạm dải phụ đề. Kiểm thêm: cảnh không quá ngắn, chủ thể không ra ngoài khung, `sip_coffee` phải có cốc.
Validator chạy được **không cần Blender** (nhờ director + manifest).

---

## 8. Quy tắc AI
- AI chỉ sinh JSON theo schema (structured output). Mọi ID truyền dạng enum. Gọi theo lô (~1 phút truyện mỗi lô), truyền tóm tắt cảnh trước.
- Lỗi validator thì tự gửi lại AI sửa, tối đa 2 lần, sau đó hiện viền đỏ cho người dùng.
- Đọc `workspace/channel_library/series_bible.md` khi viết kịch bản.
- Không đưa nhân vật, logo, tên riêng có bản quyền vào kịch bản hay tài nguyên.
- Khóa API chỉ để trong `.env`.

---

## 9. Lộ trình giai đoạn

Mỗi giai đoạn: kế hoạch → người dùng duyệt → làm → `/phase-gate` → cập nhật `PROGRESS.md` → `git commit`. Tên giai đoạn phải khớp `docs/PROGRESS.md`.

| Giai đoạn | Mục tiêu | Điều kiện qua cửa |
| :--- | :--- | :--- |
| **0. Dựng khung monorepo** | Sắp lại thư mục theo mục 6, không đổi cách render. `packages/shared` có schema zod cho script, timing, storyboard, catalog, công thức minifig, bộ set. Thêm Vitest, typecheck, hook, `/phase-gate`, `visual-qa`, `start.bat` (tạm mở trang hướng dẫn), `CLAUDE.md` tiếng Việt. Chuyển `vault_config/` sang `workspace/channel_library/` | `npm install`, `npm run typecheck`, `npm test` sạch. Tập mẫu `showcase_v1` chạy lại qua cửa contact sheet, ảnh khớp bản cũ (hộp đầu lệch < 0,5% khung). Hook chặn được `Math.random` trong `packages/director` (thử thật) |
| **1A. Bộ đạo diễn TS + Blender phát timeline** | Chuyển timeref, acting, mặt + chớp mắt, lip-sync, camera preset, rung tay, lắp ráp, FX sang `packages/director`. Blender đổi sang đọc `baked_timeline.json`. Blender xuất `manifest.json` | Test Vitest cho từng mô-đun. Render lại `showcase_v1`: `visual-qa` PASS, so khung với bản cũ thấy cùng bố cục. Nướng 2 lần ra cùng sha256 |
| **1B. Xuất glTF + máy chiếu Three.js** | Blender xuất `.glb` cho 5 diễn viên và 3 bộ set (gạch dùng chung lưới, có nhóm bước lắp ráp). `PreviewScene` (`@remotion/three`) phát timeline: nhựa bóng, HDRI, mặt 2D theo ô, camera có lệch ống kính, làm mờ hậu cảnh nhẹ | Cùng khung hình: hộp đầu ở bản Three.js lệch bản Blender < 2% khung (test tự động trên 5 khung mẫu). `visual-qa` PASS trên ảnh tĩnh. Player chạy mượt (đo, ghi số) |
| **2A. Server + kho 2 tầng** | Express phục vụ `workspace/`. API tập, tài nguyên, `promoteToChannel`. `jsonStore` atomic + tự lưu. Hàng đợi việc nền cho Blender và Remotion có tiến trình. Chép phần dùng được từ PSE | Tạo tập mới. Nướng timeline và render contact sheet qua API. Tắt mở lại không mất dữ liệu. Test cho `jsonStore`, `promote`, hàng đợi |
| **2B. Studio lõi** | 5 tab (chép khung PSE). Tab 4: Player (Three.js + lớp chữ) + thẻ cảnh sửa được + `Kiểm khung`. Tab 5: xuất video. `start.bat` mở app thật | Sửa thẻ cảnh thì Player đổi ngay và JSON đã lưu. Xuất được `showcase_v1` từ giao diện |
| **2C. Xưởng 3D** | Không gian kéo thả + ráp minifig xem 3D xoay được (nướng `.glb` khi lưu) + trang bộ set (mốc đứng, xem lắp ráp) | Ráp minifig mới dưới 2 phút, thấy ngay trong Player. Tắt mở lại nút vẫn đúng chỗ |
| **3A. AI kịch bản + bảng tài nguyên** | Tab 1. Cổng AI (chép từ PSE), series bible, khuôn tập, Góc nhìn của tôi | Dán một truyện mới: diễn viên kho kênh được nhận đúng, đồ mới vào kho tập |
| **3B. Giọng & khớp giờ** | Tab 3: nạp giọng, TTS trên máy, SAPI, Whisper tự khớp giờ, lip-sync chung một đường | Tự khớp giờ file 2 phút lệch không quá ~0,3 s/câu (kiểm 5 câu) |
| **3C. AI đạo diễn** | Storyboard theo lô + validator (luật không che mặt chạy không cần Blender) + tự sửa + "AI viết lại riêng cảnh này" | Truyện mới → storyboard 0 lỗi nặng, xem ngay trong Player, không sửa tay JSON |
| **4A. Xuất bản dài** | Render chia chặng bằng Blender, làm tiếp khi bị tắt, render lại riêng chặng, trộn tiếng một lần | Xuất trọn một tập 3–5 phút. Chỗ nối không giật. Tắt giữa chừng mở lại làm tiếp được |
| **4B. Đa ngôn ngữ, Shorts, Hộp thư Claude** | Phụ đề nhiều ngôn ngữ, Shorts dọc, hộp thư đẩy cảnh khó sang Claude, sổ chi phí AI | Xuất bản tiếng Anh và một Shorts dọc đúng bố cục |
| **4C. Phòng biên kịch** | Gửi file outline (docx/pdf/md/txt/fountain), skill Screenwriter, viết nhanh 1 bước (A), dàn ý -> phê bình đạt/không đạt -> duyệt -> thoại -> sửa (B), số câu theo độ dài | Từ một file outline ra kịch bản qua cả hai đường, file độc bị chặn, kịch bản đi tiếp tới giọng + storyboard |
| **5A. Chống giật hình** | Rung tay máy quay và boil khớp đổi từ nhiễu trắng mỗi khung sang nhiễu chậm tất định (vẫn khoá CONSTANT 12 hình/giây), biên độ tính theo điểm ảnh | Test: cảnh tĩnh lệch < 0,6 px mỗi khung thế giới. Đo video trước/sau (dịch nền mỗi khung). Nướng 2 lần cùng sha256. Render lại `showcase_v1`, `visual-qa` PASS |
| **5B. Block 2 phút** | Tập chia block ~2 phút cắt ở ranh giới câu/cảnh (`block` trên từng câu). Đầu block khớp lưới khung. Bộ đạo diễn tính nhiễu, chớp mắt, vòng lặp động tác theo block, nên mỗi block nướng ra lát timeline độc lập (`sliceTimeline`) có mã băm riêng | Test: thêm khoảng lặng ở block 1 thì lát block 2 giữ nguyên mã băm. Nướng 2 lần cùng sha256. Player xem riêng từng block |
| **5C. Một nút ra bản xem trước + bảng nhận xét** | Gửi file -> nút "Làm bản xem trước": Claude viết kịch bản theo block -> giọng -> khớp giờ -> AI đạo diễn (việc nền) -> tab Duyệt: từng block có Player, lời thoại, nhận xét tự động, ô góp ý; "Claude sửa block này" chỉ viết lại/dựng lại block đó | Từ một file outline ra bản xem trước theo block không cần bấm từng tab. Góp ý một block -> chỉ block đó đổi, block khác giữ mã băm |
| **5D. Render từng block** | Render bản cuối theo block (Blender + lớp chữ + tiếng), lưu theo mã băm lát, mỗi block ra một MP4 xem được, ghép bản cuối bằng nối video + một bản trộn tiếng | Sửa một block rồi xuất lại: chỉ block đó render lại. Chỗ nối không giật, khẩu hình không lệch |
| **6A. Nghiên cứu bố cục + skill** | Khảo sát mã nguồn mở về thành phố thủ tục, WFC, LLM dựng cảnh, máy quay tự động, skill quay phim -> `docs/LAYOUT_RESEARCH.md` (chọn/bỏ có lý do); 2 skill `brick-world-layout-architect`, `cinematic-camera-blocking` | Báo cáo có link + số sao + quyết định; skill nạp được |
| **6B. Ngữ pháp máy + dàn cảnh nhiều set** | Preset `ews/ws/mls/ms/cu/ots`, góc `low/high/birds_eye`, chuyển động `dolly_in/out, truck_pan, crane_reveal`, tilt-shift theo cỡ cảnh; diễn viên chuyển set (`actors[id].at`); xếp set theo bán kính vòm; đèn + trời theo set của từng cảnh; cutaway hợp nhất với lắp ráp (`T.stage`) ở cả Blender và Three.js | 4 tập cũ nướng ra y hệt (test sha256); birds-eye không lật trục; Blender khớp bộ đạo diễn ≤ 0,00004 |
| **6C. Thế giới 3 vòng** | `world_kit.py` + 7 set mới (sân diễn, trung cảnh gộp lưới, chân trời, vòm), biển hiệu chung chung, 4 preset ánh sáng mới, catalog có `moods`/`best_for`; bộ kiểm bố cục (`layout.ts`): vật lơ lửng, che mặt, ra ngoài vòm; ma trận 10 khung máy cho mọi set | `layout.test.ts` xanh cho mọi set; contact sheet ma trận từng set; visual-qa PASS |
| **6D. Biên kịch hình ảnh + lọc đơn điệu** | Nhịp/câu có `location`, `mood`, `visual`, `prop_cue`; biên kịch thấy danh sách bối cảnh sống; mục chấm `location_arc` (code đếm) + `visual_story`; storyboard tự chèn cảnh mở khi đổi nơi; `visualLint` ở tab Duyệt block và khi Claude sửa block; tab Đạo diễn có góc máy + mọi set, tab Kịch bản có cột bối cảnh | `showcase_v2_world` 30–45 giây, ≥ 4 set, đủ EWS / nhìn từ trên / góc thấp / qua vai / cận mặt, 0 lỗi che mặt; `npm test` xanh |

---

## 10. Những gì giữ nguyên từ LegoStudio v1
Gạch dựng bằng code không logo; minifig với rig 10 khớp; atlas mặt 9 biểu cảm × 14 miệng; 15 động tác stop-motion; 8 hiệu ứng Grease Pencil;
3 bộ set; 5 diễn viên; lớp chữ Remotion; contact sheet + luật không che mặt; nhịp 12 → 60 hình/s; tiếng clack và nhạc nền tự tạo.

## 11. Câu lệnh khởi động
Lần đầu:
> Đọc CLAUDE.md và docs/MASTER_ADD.md. Lập kế hoạch Giai đoạn 0, liệt kê những gì sẽ tạo và chuyển. Chờ tôi đồng ý rồi mới làm.

Các lần sau (sau `/clear`):
> Đọc docs/PROGRESS.md rồi lập kế hoạch cho giai đoạn tiếp theo theo docs/MASTER_ADD.md. Chờ tôi đồng ý rồi mới làm.
