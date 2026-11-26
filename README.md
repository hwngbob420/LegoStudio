# LegoStudio (Lego Studio Engine v2)

Studio làm video giải thích hài **phong cách mô hình gạch 3D**, chạy hoàn toàn trên máy Windows của bạn. Minifig có **gương mặt 2D**
đổi biểu cảm tức thì, bộ set gạch không logo, chữ và biểu đồ kiểu sách hướng dẫn lắp ráp.
Quy trình làm theo mô hình **pixel-story-engine**: dán truyện → AI viết JSON → sửa trong Studio 5 tab → xuất video.

![contact sheet](workspace/projects/showcase_v1/contact_sheet.jpg)

## Bắt đầu
1. Cài **Node.js LTS**, **Python 3.10+**, **Blender 5.2**, **FFmpeg** (bản đầy đủ).
2. Bấm đúp **`start.bat`**. Lần đầu nó tự cài thư viện và chuẩn bị tài nguyên, rồi mở Studio ở http://localhost:5174.
3. AI viết kịch bản là **Claude Code** trên máy bạn (dùng tài khoản Claude, kèm skill `screenwriter` của dự án). Lần đầu, hoặc khi Studio báo
   "chưa đăng nhập", mở Terminal và gõ `claude auth login`. Muốn trả lời thủ công trong phiên Claude Code thì đặt `AI_SESSION_QUEUE=1` trong `.env` (Hộp thư Claude).
   Gemini chỉ dùng khi đặt `AI_PROVIDER=gemini` trong `.env`.

## Studio 5 tab
| Tab | Làm gì |
|---|---|
| **Kịch bản** | Gửi file outline (.docx, .pdf, .md, .txt, .fountain) hoặc dán truyện, chọn ngôi kể, giọng văn (16 kiểu), độ dài (20 giây – 30 phút), thông điệp → **Generate kịch bản**: Claude lập dàn ý, tự chấm, viết thoại theo từng phần; sửa dàn ý rồi viết lại thoại được |
| **Xưởng** | Ráp minifig xoay 3D (da, tóc, áo in, phụ kiện, giọng), vai quần chúng ngẫu nhiên, Lưu sang kho kênh, sơ đồ tập dạng nút |
| **Giọng đọc** | Tạo giọng trên máy, hoặc nạp giọng thật từng câu rồi **Tự khớp giờ** bằng Whisper; khẩu hình 2D tự sinh |
| **Đạo diễn & Xem trước** | **AI tạo Storyboard**; Player 3D xem ngay (Three.js); sửa thẻ cảnh (góc máy, biểu cảm, động tác, hiệu ứng); lỗi "thẻ chữ che mặt" hiện tức thì; **Kiểm khung** bằng Blender |
| **Xuất bản** | Render bản cuối bằng Blender EEVEE chia chặng (tắt máy vẫn làm tiếp được), **phụ đề đa ngôn ngữ**, **Shorts dọc 1080x1920**, sổ chi phí AI |

## Kiến trúc (phương án C)
- **Một bộ đạo diễn duy nhất** (`packages/director`, TypeScript) tính trước mọi chuyển động thành `baked_timeline.json`.
- **Hai máy chiếu phát lại đúng file đó:** Three.js trong trình duyệt (xem trước tức thì) và Blender EEVEE (bản cuối, chất 3D cao).
  Hai bên khớp nhau tới 0,000008 khung, có test tự động.

| Thư mục | Nội dung |
|---|---|
| `packages/shared` | Schema zod cho mọi JSON, hằng số, mốc thời gian, căn chữ Whisper |
| `packages/director` | Động tác stop-motion, mặt + khẩu hình, camera (1/3, tilt-shift, khung dọc), lắp ráp, kiểm "không che mặt", dựng storyboard từ nhịp AI, tự sửa bố cục, Shorts |
| `apps/brick-engine` | Python + Blender 5.2: gạch không logo, minifig rig 10 khớp, bộ set, xuất `.glb` + manifest, render chia chặng, TTS SAPI, âm thanh, ghép FFmpeg |
| `apps/video-engine` | Remotion: lớp chữ hướng dẫn lắp ráp (thẻ STEP, part callout, biểu đồ gạch, mũi tên, phụ đề) + máy chiếu Three.js |
| `apps/server` | Express: API tập/kho/xem trước, hàng đợi việc nền, cổng AI (Gemini + dự phòng + Hộp thư Claude), Whisper |
| `apps/studio-ui` | React + Vite + Tailwind: Studio 5 tab |
| `workspace/channel_library` | Kho kênh: diễn viên, bộ set, gương mặt, ánh sáng, manifest, series bible |
| `workspace/projects/<tập>` | Kịch bản, storyboard, bản dịch, video |

## Tập mẫu
- `showcase_v1` "Bug Hunt": 19,5 giây, có thêm bản phụ đề tiếng Việt `output_final_vi.mp4`.
- `ep01_foam_physics`: Kofi + Grandma Lin ở phố quán cà phê (storyboard do đạo diễn tự động dựng).
- `ep02_the_to_do_list_trap`: tập dài 3 phút 10 giây, 52 câu, render chia chặng. Trên GitHub chỉ có bản xem trước `output_preview_720p.mp4`
  (bản 1080p60 nặng 125 MB, vượt giới hạn GitHub; chạy `npm run produce` để tự render).
- `showcase_v1_shorts`: bản Shorts dọc 1080x1920 của "Bug Hunt", tạo bằng nút "Tạo Shorts dọc".

## Lệnh cho người dùng nâng cao
```bash
npm test                                                        # 72 test tự động
npm run doctor                                                  # kiểm sức khoẻ môi trường
npm run produce -- workspace/projects/<tập>                     # làm trọn một tập ra output_final.mp4
npm run produce -- workspace/projects/<tập> --from overlay --to composite --lang vi   # chỉ xuất lại phụ đề tiếng Việt
```

## An toàn thương hiệu
Núm gạch trơn, không logo; khung hình không có chữ thương hiệu (hook tự chặn). Dự án không liên quan và không được bảo trợ bởi LEGO Group.

Tài liệu: `docs/MASTER_ADD.md` (đặc tả) · `docs/PROGRESS.md` (tiến độ) · `CLAUDE.md` (luật cho Claude) · `docs/OPTIMIZATION_LOG.md`.
