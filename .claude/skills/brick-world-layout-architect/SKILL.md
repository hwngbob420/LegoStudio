---
name: brick-world-layout-architect
description: Dựng và sửa bộ set gạch "3 vòng" của Lego Studio (sân diễn chi tiết + trung cảnh + chân trời + vòm trời khép kín), đặt mốc diễn, nhóm cutaway, và cho qua bộ kiểm bố cục (vật lơ lửng, che mặt, lộ mép). Dùng khi thêm bối cảnh mới, sửa apps/brick-engine/sets_world.py hoặc world_kit.py, hoặc khi contact sheet lộ khoảng trống / mặt bị đồ vật che.
---

# Kiến trúc sư thế giới gạch (set 3 vòng)

Code: `apps/brick-engine/world_kit.py` (bộ dựng vòng 2/3, vòm, gộp lưới) + `apps/brick-engine/sets_world.py` (7 set).
Kiểm: `packages/director/src/layout.ts` (+ `layout.test.ts` chạy mọi set trong kho).
Nghiên cứu nền: `docs/LAYOUT_RESEARCH.md`.

## Bố cục một set
| Vòng | Bán kính | Dựng bằng | Ghi chú |
| :--- | :--- | :--- | :--- |
| 1 sân diễn | 40x28 núm (3,2 x 2,24 m) | `sb.place(...)`, gạch có núm, tên riêng từng viên | lắp ráp từng bước (`sb.next_step()`), mốc diễn `sb.anchor` |
| 2 trung cảnh | tới ~6,5 m | `WK.Merge` (gộp theo vật liệu) + `block_row`, `facade`, `tree`, `lamp`, `car`, `bench` | chừa **hành lang máy** phía trước (y < −1,2 m tới −5,5 m) |
| 3 chân trời | 7,2–9,4 m, 360° | `WK.skyline` | màu pha về màu sương theo khoảng cách (không dùng sương volumetric) |
| vòm | `EXTENT` 11,5 m, cao 7,5 m | `WK.dome` (vertex color) + đĩa nền | máy luôn ở trong vòm -> không bao giờ lộ khoảng trống |

`_base()` đặt sẵn `sb.center`, `sb.extent`, `sb.dome_h`, `sb.floor_z`. `export_manifest.py` ghi các trường này cùng hộp bao từng vật
(`bb`), hộp con của vật gộp (`parts`), `cut`, `ring`, `float_ok`, `see_through`, `label`. Set cũ không có `extent` nên không đổi.

## Luật bắt buộc
1. **Đứng trên mặt ô.** Sàn lát kín (tile ở `Z`), đồ vật đặt ở `Z + 1`. Chỗ không lát (đường nhựa, bậc cửa) thì đặt ở `Z`.
   Bộ kiểm báo `lơ lửng` khi đáy vật cách mặt đỡ hơn 4 mm.
2. **Mốc diễn.** Hai mốc đầu trong `MARK_ORDER` (`packages/director/src/compose.ts`) là cặp hội thoại: cách nhau 0,6–0,9 m, cùng
   quay về phía máy (|facing| ≤ 30°), không đứng sau lưng nhau theo trục nhìn. Mốc thứ 3 trở đi cách mọi mốc khác ≥ 0,3 m.
3. **Không chắn mặt.** Vật to (xe, quầy, kệ) đặt ở **sau** hoặc **bên** người diễn, không nằm giữa máy và mặt. Quầy cao tối đa
   ~6 plate (dưới cằm). Xe buýt/xe con làm hậu cảnh.
4. **Cutaway.** Trần: `_ceiling()` (nhóm `ceiling`). Tường trước/hai bên: `WK.tag_cut(objs, "front" | "left" | "right")`.
   Bộ đạo diễn ẩn cả nhóm khi nó chắn tia máy -> mặt hoặc máy cao hơn trần. Kính: `WK.glassify()` (nhìn xuyên, không đổ bóng).
5. **An toàn thương hiệu.** Biển hiệu dùng `WK.sign_tile` với texture chữ chung chung trong `texture_gen.py` (CAFE, MART, 24H,
   BOOKS, OPEN, số tuyến 7). Không tên riêng, không logo, không màu nhận diện của chuỗi cửa hàng / hãng xe thật.
6. **Tất định.** Biến thể chọn bằng `WK.Rnd(tên set)`, không dùng `random`.

## Thêm một set mới
1. Viết `build_<tên>(origin)` trong `sets_world.py` theo khung `_base -> vòng 1 -> anchors -> vòng 2 -> skyline`, thêm vào `WORLD_SETS`.
2. Thêm `MARK_ORDER` (compose.ts), mục trong `catalog.json` (`lighting`, `moods`, `anchors`, `rings: 3`, `notes`, `best_for`) và
   `workspace/channel_library/sets/<id>.json`.
3. Chạy lại tài nguyên: `blender -b --factory-startup -P apps/brick-engine/export_manifest.py` rồi `.../export_glb.py`.
4. Kiểm số học: `npx vitest run packages/director/src/layout.test.ts` (lơ lửng + ma trận 10 khung máy).
5. Kiểm bằng mắt: `npx tsx packages/director/src/matrixCli.ts <SetId>` rồi
   `python apps/brick-engine/gpu_renderer.py workspace/_qa/matrix/<SetId> --mode contact --fast` và
   `python apps/brick-engine/contact_sheet_gen.py workspace/_qa/matrix/<SetId>` -> mở MỘT ảnh `contact_sheet.jpg`. Gửi visual-qa.
6. Thêm set mới vào `GOLDEN`? Không: test hồi quy chỉ khoá các tập cũ; set mới được `layout.test.ts` tự quét.
