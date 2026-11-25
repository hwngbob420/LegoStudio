# Tiến độ dự án

Tên giai đoạn phải khớp đúng với `docs/MASTER_ADD.md` mục 9.

| Giai đoạn | Trạng thái | Ngày xong | Ghi chú |
| :--- | :--- | :--- | :--- |
| v1. LegoStudio bản đầu (engine Python + Blender + Remotion) | Xong | 2026-11-25 | Showcase "Bug Hunt" 19,5 s 1080p60, contact sheet qua cửa, đã đẩy lên GitHub (`d7af893`) |
| 0. Dựng khung monorepo | Xong | 2026-11-25 | Monorepo (shared, director, video-engine, brick-engine), schema zod + timeref TS, hook + test hook, /phase-gate, visual-qa, start.bat, CLAUDE.md tiếng Việt. 14 test qua, typecheck sạch. Contact sheet showcase khớp bản cũ tuyệt đối (lệch 0,00000). |
| 1A. Bộ đạo diễn TS + Blender phát timeline | Chưa làm | | |
| 1B. Xuất glTF + máy chiếu Three.js | Chưa làm | | |
| 2A. Server + kho 2 tầng | Chưa làm | | |
| 2B. Studio lõi | Chưa làm | | |
| 2C. Xưởng 3D | Chưa làm | | |
| 3A. AI kịch bản + bảng tài nguyên | Chưa làm | | |
| 3B. Giọng & khớp giờ | Chưa làm | | |
| 3C. AI đạo diễn | Chưa làm | | |
| 4A. Xuất bản dài | Chưa làm | | |
| 4B. Đa ngôn ngữ, Shorts, Hộp thư Claude | Chưa làm | | |

## Ghi chú cho phiên sau
- Đã chốt phương án C (2026-11-25): một bộ đạo diễn TypeScript nướng `baked_timeline.json`; Three.js xem trước, Blender EEVEE render bản cuối.
- Mô hình tham chiếu: `C:\pixel-story-engine` (quy trình, Studio, cổng AI, Whisper, jsonStore). Chép có chọn lọc, không sửa repo đó.
- Gđ 0: kho kênh ở `workspace/channel_library/` (cast, sets, faces, lighting, palette, catalog). Tài nguyên nướng ở `baked/` (không commit).
  Tập mẫu ở `workspace/projects/showcase_v1/` (`storyboard.json` thay cho `episode_shotlist.json`). So hồi quy contact: `apps/brick-engine/tools/compare_contact.py`.
