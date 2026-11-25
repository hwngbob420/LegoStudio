# Tiến độ dự án

Tên giai đoạn phải khớp đúng với `docs/MASTER_ADD.md` mục 9.

| Giai đoạn | Trạng thái | Ngày xong | Ghi chú |
| :--- | :--- | :--- | :--- |
| v1. LegoStudio bản đầu (engine Python + Blender + Remotion) | Xong | 2026-11-25 | Showcase "Bug Hunt" 19,5 s 1080p60, contact sheet qua cửa, đã đẩy lên GitHub (`d7af893`) |
| 0. Dựng khung monorepo | Xong | 2026-11-25 | Monorepo (shared, director, video-engine, brick-engine), schema zod + timeref TS, hook + test hook, /phase-gate, visual-qa, start.bat, CLAUDE.md tiếng Việt. 14 test qua, typecheck sạch. Contact sheet showcase khớp bản cũ tuyệt đối (lệch 0,00000). |
| 1A. Bộ đạo diễn TS + Blender phát timeline | Xong | 2026-11-25 | `packages/director` nướng `baked_timeline.json` (động tác, mặt, khẩu hình, camera, lắp ráp, FX, SFX, hộp đầu dự đoán). Blender chỉ phát lại. Đối chiếu Blender với bộ đạo diễn lệch 0,000008. Nướng 2 lần cùng sha256. visual-qa PASS (SSIM 0,92 so với v1). |
| 1B. Xuất glTF + máy chiếu Three.js | Xong | 2026-11-25 | `export_glb.py` (5 diễn viên, 3 bộ set, cốc). Composition `Preview` (`@remotion/three`): mặt 2D theo ô, màn hình/poster, FX, lắp ráp, camera khớp Blender (test lệch < 0,5%). Render không màn hình ~5 khung/s ở 960x540 (WebGL ANGLE). |
| 2A. Server + kho 2 tầng | Xong | 2026-11-25 | Express (cổng 8788, chỉ 127.0.0.1): API tập/kho/xem trước/việc nền, `jsonStore` atomic, hàng đợi lần lượt có tiến độ và lưu lịch sử, kho 2 tầng cho minifig + Lưu sang kho kênh. 41 test. Đã chạy thật việc "Kiểm khung" qua API. |
| 2B. Studio lõi | Xong | 2026-11-25 | Studio 5 tab (React + Vite 8 + Tailwind + Lucide, cổng 5174). Tab Đạo diễn: Player (Three.js + lớp chữ + giọng) nướng lại sau mỗi lần sửa, thẻ cảnh, bảng sửa camera/vùng/biểu cảm/động tác/hiệu ứng, lỗi che mặt hiện ngay, nút Kiểm khung chạy Blender. Đã thử thật trong trình duyệt. Chưa đo FPS Player (ô xem trước bị ẩn khi thử). |
| 2C. Xưởng 3D | Xong | 2026-11-25 | Ráp minifig xem 3D xoay được (xem nhanh từ bộ mảnh, sau khi Nướng kho là .glb thật), vai quần chúng ngẫu nhiên lặp lại được, lưu kho tập, Lưu sang kho kênh, thêm vào tập theo mốc. Sơ đồ tập (React Flow): kéo dây diễn viên vào cảnh sửa storyboard thật, vị trí nút lưu canvas.json. Đã thử thật: ráp, Nướng kho (15 s), thêm vào tập, tạo giọng, xem trong Player. |
| 3A. AI kịch bản + bảng tài nguyên | Xong (chưa thử Gemini thật) | 2026-11-25 | Cổng AI chép từ PSE (Gemini + dự phòng kiểu OpenAI/Ollama, tự chuyển khi lỗi), series bible, Tab 1 "Phân tích bằng AI" bắt buộc Góc nhìn của tôi, diễn viên mới vào kho tập. Test bằng AI giả. Cần khoá trong `.env` để chạy thật. |
| 3B. Giọng & khớp giờ | Xong | 2026-11-25 | Nạp giọng thật từng câu, Tự khớp giờ bằng Whisper medium (dùng chung bộ cài PSE), khẩu hình suy từ chữ cái. Thử thật trên 5 câu: đầu/cuối câu lệch tối đa 0,025 s (yêu cầu < 0,3 s), trung vị lệch từ 0,11 s. |
| 3C. AI đạo diễn | Xong (chưa thử Gemini thật) | 2026-11-25 | AI trả nhịp (beats) theo lô 8 câu, `compose` dựng storyboard + tự đặt thẻ chữ đối diện người nói, kiểm schema/ID/che mặt, gửi lại sửa tối đa 2 lần, tự bỏ thẻ che mặt. Không có khoá thì dùng đạo diễn tự động. "AI viết lại riêng cảnh này" giữ nguyên cảnh khác. Thử thật: tập mới Foam Physics (6 câu) -> 7 cảnh, 0 lỗi, xem được trong Player. |
| 4A. Xuất bản dài | Đang làm | | Xong: render chia chặng (`chunk_renderer.py`), trạng thái chặng trong project.json, nối lại sau khi tắt (đã thử: tắt giữa chặng 1, chạy lại bỏ qua chặng 0 và làm nốt), render lại riêng chặng (`--redo N`), ghép concat. Bộ tự sửa bố cục `autoFix`. Showcase render lại từ 4 chặng (19,5 s, 1170 hình 60 fps). Còn: render tập dài `ep02_the_to_do_list_trap` (52 câu, 3 phút 10 giây, storyboard 0 lỗi) và soi chỗ nối. |
| 4B. Đa ngôn ngữ, Shorts, Hộp thư Claude | Chưa làm | | |

## Ghi chú cho phiên sau
- Đã chốt phương án C (2026-11-25): một bộ đạo diễn TypeScript nướng `baked_timeline.json`; Three.js xem trước, Blender EEVEE render bản cuối.
- Mô hình tham chiếu: `C:\pixel-story-engine` (quy trình, Studio, cổng AI, Whisper, jsonStore). Chép có chọn lọc, không sửa repo đó.
- Gđ 0: kho kênh ở `workspace/channel_library/` (cast, sets, faces, lighting, palette, catalog). Tài nguyên nướng ở `baked/` (không commit).
  Tập mẫu ở `workspace/projects/showcase_v1/` (`storyboard.json` thay cho `episode_shotlist.json`). So hồi quy contact: `apps/brick-engine/tools/compare_contact.py`.
- Gđ 1A: nướng bằng `npx tsx packages/director/src/cli.ts workspace/projects/<tập>` (produce.py gọi ở bước `bake`). `workspace/channel_library/manifest.json` sinh bằng `blender -b --factory-startup -P apps/brick-engine/export_manifest.py`, phải chạy lại khi sửa builder (cửa contact báo `director_parity` nếu lệch).
- Gđ 1B: `.glb` sinh bằng `blender -b --factory-startup -P apps/brick-engine/export_glb.py` vào `baked/glb/`. Xem trước: `npx tsx apps/video-engine/scripts/previewProps.ts <tập>` rồi `npx remotion still src/index.ts Preview out.png --frame=N --props=../../workspace/projects/<tập>/build/preview_props.json` (trong apps/video-engine).
- Còn nợ nhỏ (từ visual-qa, có từ v1): gạch biểu đồ x3 bị cắt mép thẻ khi sụp; tóc Priya có bậc khi quay; hạt nhiễu ở hông. `output_final.mp4` sẽ render lại ở cuối (sau khi sửa tư thế uống cà phê và tránh chớp mắt đúng khung QA).
- Gđ 2A: `npx tsx apps/server/src/server.ts` (hoặc `npm run dev:server`). Việc nền: tts, contact, render, publish, recut, library. Diễn viên riêng của tập ở `workspace/projects/<tập>/assets/cast/`, Python + director đọc 2 tầng (`paths.cast_recipe_files`, `castRecipeFiles`).
- Gđ 2B: mở app bằng `start.bat` (server 8788 + Studio http://localhost:5174). `.claude/launch.json` có cấu hình `lse-server`, `lse-studio`. Studio phải dùng Vite 8 (cùng bản Vitest kéo vào gốc), `@vitejs/plugin-react` 6.
- Gđ 2C: "Nướng kho" = face_atlas_gen + texture_gen + export_manifest + export_glb (khoảng 15 s). Trong Python, alias `paths` ở face_atlas_gen/texture_gen là `PATHS` (vì có hàm vẽ tên `P`).
- Lưu ý khi thử bằng ô trình duyệt bị ẩn: ResizeObserver không chạy nên React Flow cần kích thước + chốt nối khai báo sẵn (đã làm); Player Three.js vẽ lại khi canvas đổi cỡ.
- Gđ 3: AI cần `.env` (GEMINI_API_KEY + GEMINI_MODEL, hoặc AI_FALLBACKS + Ollama). Bạn có thể chép file `.env` từ pixel-story-engine. Whisper tìm ở `WHISPER_DIR`, rồi `workspace/_cache/whisper`, rồi bộ cài của PSE.
- Tập mẫu thứ hai: `workspace/projects/ep01_foam_physics` (Kofi + Grandma Lin, phố quán cà phê, storyboard do đạo diễn tự động dựng).
