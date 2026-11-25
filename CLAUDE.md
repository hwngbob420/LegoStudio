# Lego Studio Engine — Luật dự án cho Claude Code

Ứng dụng chạy trên máy (Windows) biến truyện chữ thành video giải thích hài hước phong cách mô hình gạch 3D. Minifig có **gương mặt 2D**,
bộ set gạch không logo, chữ và biểu đồ kiểu sách hướng dẫn lắp ráp.
Đặc tả đầy đủ: `docs/MASTER_ADD.md`. Tiến độ: `docs/PROGRESS.md`. Mô hình tham chiếu: `C:\pixel-story-engine` (chỉ đọc, không sửa).

## Cách làm việc (bắt buộc)
- Đầu mỗi phiên: đọc `docs/PROGRESS.md`. Chỉ đọc mục của `docs/MASTER_ADD.md` cần cho việc đang làm.
- Làm từng giai đoạn. Hết giai đoạn thì chạy `/phase-gate`, cập nhật `docs/PROGRESS.md`, rồi `git commit`.
  Người dùng đã cho phép tự làm liền các giai đoạn và tự sửa lỗi; chỉ hỏi khi có thay đổi ảnh hưởng lớn tới dự án.
- Người dùng không rành kỹ thuật: báo cáo bằng tiếng Việt đơn giản, ghi rõ lệnh cần gõ và bấm gì.
- Máy Windows: đường dẫn dùng `path.join` / `os.path.join`; script npm phải chạy được trên Windows.
- Không tự cài skill, plugin, MCP hay gói npm/pip ngoài danh sách ở `docs/MASTER_ADD.md` mục 3 mà chưa hỏi.
  Mọi gói `remotion` và `@remotion/*` ghim cùng MỘT phiên bản chính xác.
- Mỗi mô-đun logic thuần (schema, timeref, các phần của director, validator, jsonStore) phải có test Vitest. `npm test` luôn phải chạy được.

## Kiến trúc cố định (phương án C)
- Monorepo npm workspaces:
  - `packages/shared`: schema zod, hằng số, timeref.
  - `packages/director`: bộ đạo diễn tất định, nướng `baked_timeline.json`.
  - `apps/video-engine`: Remotion, gồm lớp chữ và máy chiếu Three.js xem trước.
  - `apps/brick-engine`: Python + Blender 5.2, dựng tài nguyên và render bản cuối.
  - `apps/server`: Express.
  - `apps/studio-ui`: React + Vite.
- **Một bộ đạo diễn, hai máy chiếu.** Chuyển động, camera, mặt, khẩu hình, lắp ráp chỉ được tính trong `packages/director`.
  Blender và Three.js chỉ phát lại `baked_timeline.json`, không tự tính chuyển động.
- Mọi JSON (`script.json`, `storyboard.json`, `timing.json`, `catalog.json`, `cast/*.json`, `sets/*.json`) phải được kiểm bằng schema trong
  `packages/shared` trước khi ghi và sau khi đọc. Ghi file kiểu an toàn: ghi file tạm rồi đổi tên.
- **AI chỉ sinh JSON.** Mọi việc dựng hình, chuyển động, trộn âm, xuất video do code cố định làm.
- **Đường dẫn Python** chỉ khai báo ở `apps/brick-engine/paths.py`. Kho kênh ở `workspace/channel_library/`, tập ở `workspace/projects/<tập>/`.
  Tài nguyên nướng hoặc tải về nằm trong `workspace/channel_library/baked/` (không commit, `python bootstrap_studio.py` dựng lại).
- Khóa API chỉ để trong `.env` (không commit, không đọc).

## Luật hình 3D
- **Mặt là 2D.** Không bao giờ thêm hình khối miệng hay shape key. Đổi biểu cảm bằng ô atlas (`face_expr`, `face_mouth`).
- **Nhịp stop-motion.** Thế giới chạy 12 hình/giây với khóa CONSTANT; giao video 60 hình/giây (giữ mỗi hình 5 lần). Không làm mượt bezier cho chuyển động thế giới.
- **Blender 5.2:**
  - engine là `BLENDER_EEVEE`;
  - fcurve nằm trong `action.layers[].strips[].channelbag(slot)`;
  - luôn chạy `-b --factory-startup`.
- 1 núm = 0,08 m. Làm mờ hậu cảnh (tilt-shift) bằng khẩu độ thật f/1.0–1.8; luôn có rim light.
- **Không che mặt.** Thẻ chữ hoặc biểu đồ ở 1/3 nào thì chủ thể đứng 1/3 đối diện. Dải phụ đề (y > 0,83) cấm mặt.
  Cửa kiểm contact sheet báo trượt khi có va chạm ở bất kỳ khung mẫu nào.
- **An toàn thương hiệu.** Núm trơn, không logo; không có chữ thương hiệu (lego, duplo) trong chữ hiển thị, poster, màn hình, áo in. Hook tự chặn.

## Luật tất định
- Trong `packages/director` và `apps/video-engine`: CẤM `Math.random()`, `Date.now()`, `new Date()`, `performance.now()`, `setTimeout/setInterval`.
  Hook tự chặn. Dùng ngẫu nhiên có hạt giống (crc32 của ID) theo số khung.
- Nướng cùng storyboard hai lần phải ra cùng sha256.

## Chữ, âm thanh, biểu tượng
- Cấm emoji trong UI, video và các gói. UI dùng Lucide.
- UI tiếng Việt tự nhiên. Phụ đề video theo ngôn ngữ xuất, nằm trong `locales/`.
- Nhạc nền tự hạ khi có lời đọc.

## Kiểm tra thị giác
- Mọi thay đổi ảnh hưởng tới hình (brick-engine, video-engine, director) phải qua subagent `visual-qa` trước khi báo xong.
- Mỗi vòng QA chỉ mở MỘT ảnh tổng (`contact_sheet.jpg` hoặc `qa_frames/_strip.jpg`), trừ khi cần soi chi tiết.

## Lệnh hay dùng
```bash
python bootstrap_studio.py                                   # máy mới: tải HDRI, vẽ atlas + texture, npm install
npm test                                                     # test
npm run typecheck                                            # kiểm kiểu
npm run doctor                                               # kiểm sức khỏe môi trường
npm run produce -- workspace/projects/<tập>                  # làm trọn một tập ra output_final.mp4
npm run produce -- workspace/projects/<tập> --from audio     # cắt lại chữ + tiếng, không render 3D lại
```
