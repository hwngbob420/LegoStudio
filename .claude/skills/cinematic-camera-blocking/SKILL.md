---
name: cinematic-camera-blocking
description: Ngữ pháp máy quay điện ảnh của Lego Studio — thang cỡ cảnh (ews, ws, mls, ms, cu, ots + preset cũ), góc máy (eye_level, low_angle, high_angle, birds_eye), chuyển động (dolly, truck, crane), tilt-shift theo cỡ cảnh, ý đồ hình ảnh -> khung máy, dàn cảnh nhiều bối cảnh và bộ lọc đơn điệu. Dùng khi viết/sửa storyboard, chọn khung máy cho beat, sửa packages/director/src/camera.ts, compose.ts, stage.ts, visualLint.ts, hoặc khi tab Duyệt block báo "Hình đơn điệu".
---

# Dàn máy quay điện ảnh (blocking)

Mọi khung máy tính trong `packages/director` (một bộ đạo diễn, hai máy chiếu). AI chỉ chọn **tên** khung máy; code tính vị trí,
góc, ống kính, lệch 1/3, rung tay, cutaway.

## Thang cỡ cảnh (`camera.preset`)
| preset | cỡ | dùng khi | mặc định |
| :--- | :--- | :--- | :--- |
| `ews` | toàn cực rộng | mở bối cảnh, chuyển nơi, quy mô thành phố | 24 mm f/2.8, cao ~16°, không cần chủ thể |
| `ws` | toàn | người trong bối cảnh, phản ứng tập thể | 32 mm f/2.0, chủ thể tuỳ chọn (≤ 2) |
| `mls` | trung toàn | dáng người, đạo cụ, động tác | 40 mm f/1.8, 1 chủ thể |
| `ms` | trung | hội thoại, thẻ chữ ở 1/3 đối diện | 50 mm f/1.6, 1 chủ thể |
| `cu` | cận mặt | phản ứng deadpan mặt 2D, câu chốt | 65 mm f/1.4, 1 chủ thể |
| `ots` | qua vai | đối đáp; `subjects[0]` được quay, `subjects[1]` là vai mờ tiền cảnh | 50 mm, 2 chủ thể |
| `mcu`, `ecu`, `two_shot`, `wide_establish`, `assembly_high` | preset cũ | giữ nguyên toán cũ (tập cũ nướng ra y hệt) | |

Tilt-shift: khẩu độ mở dần theo độ gần (EWS f/2.8 -> CU f/1.4), lấy nét theo đầu chủ thể.

## Góc máy (`camera.angle`, chỉ áp cho preset mới)
- `eye_level` (mặc định, +4°)
- `low_angle` (−16°, tự nâng lên nếu máy chạm sàn): đẩy cái tôi, châm biếm, "anh hùng"
- `high_angle` (+34°): nhỏ bé, cô lập, nhìn toàn cục
- `birds_eye` (82°, cố ý không 90° để không lật trục): mê cung, hỗn loạn, mặt sàn như bản đồ; trần/tường tự dỡ

## Chuyển động (`camera.move`)
Mới: `dolly_in`, `dolly_out` (±22% quãng), `truck_pan` (trượt ngang, điểm nhìn đi theo -> thị sai tiền/hậu cảnh), `crane_reveal`
(bắt đầu thấp, nâng lên). Cũ: `push_in`, `pull_out`, `drift_right`, `crane_down`, `none`. Mọi khoá vẫn CONSTANT 12 hình/giây.

## Ý đồ hình ảnh -> khung máy (`VISUAL_TO_SHOT`, compose.ts)
establishing_scale = ews high_angle crane_reveal · intimate_deadpan = cu push_in · satirical_low_angle = mls low_angle dolly_in ·
overhead_chaos = ws birds_eye · cutaway_gag = ms dolly_in (ở set khác / Set_InstructionVoid) · conversation = ots ·
reveal = ws dolly_out · isolation = ws high_angle pull_out.

## Nhiều bối cảnh
- Câu thoại mang `location` (id bộ set) và `visual`. `compose` chia đoạn theo bối cảnh. Ở cảnh đầu đoạn, nó dời diễn viên tới mốc của
  set đó (`actors[id].at`). Nếu câu đầu ≥ 5 từ, nó chèn cảnh mở `ews` (id `S<n>e`) trên 3 từ đầu.
- Bộ đạo diễn (`stage.ts`) xếp set cách nhau theo bán kính vòm. Mỗi cảnh chỉ bật đèn và bầu trời của set đang quay. Lịch hiện/ẩn
  cutaway được hợp nhất với lắp ráp trong `T.stage`.
- Tập cũ không có `location` hay preset mới thì không có `T.stage`, và nướng ra y hệt (test `legacyGolden`).

## Luật khung hình (code kiểm, đừng phá)
- Thẻ chữ ở 1/3 nào thì chủ thể ở 1/3 đối diện. Thẻ chữ chỉ đi với `ms`/`mcu`/`mls`; `cu`/`ews`/`ws` có thẻ sẽ bị đổi thành `ms`.
- Không mặt nào trong dải phụ đề (y > 0,83). Với OTS, vai tiền cảnh được miễn, nhưng không được che quá 25% mặt người được quay.
- Bộ lọc đơn điệu (`visualLint.ts`, hiện ở tab Duyệt block) báo khi:
  - quá 22 giây cùng một cỡ cảnh;
  - quá 60 giây cùng bối cảnh và cùng góc;
  - một kiểu máy chiếm quá nửa số cảnh.
- Nhịp gợi ý cho một block 2 phút: `ews` mở -> `ms`/`ots` hội thoại -> `cu` phản ứng -> `mls low_angle` khoe khoang -> cắt gag sang
  set khác -> `ws birds_eye` hỗn loạn -> `cu` chốt.
