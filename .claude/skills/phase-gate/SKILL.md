---
name: phase-gate
description: Kiểm tra điều kiện qua cửa của giai đoạn hiện tại trong Lego Studio Engine trước khi báo hoàn thành. Dùng khi người dùng gõ /phase-gate hoặc khi vừa làm xong một giai đoạn.
---

# Cửa qua giai đoạn

1. Đọc `docs/PROGRESS.md` để biết giai đoạn hiện tại.
2. Mở `docs/MASTER_ADD.md` mục 9 và lấy cột "Điều kiện qua cửa" của giai đoạn đó.
3. Kiểm từng điều kiện bằng hành động thật (chạy lệnh, chạy test, render, mở ảnh), không đoán. Ghi bằng chứng cho từng điều kiện: lệnh đã chạy và kết quả.
4. Chạy `npm run typecheck` và `npm test` ở gốc. Hook không thấy file tạo bằng shell, nên grep lại các mẫu cấm trong `packages/director/src` và `apps/video-engine/src`:
   - `Math.random(`, `Date.now(`, `new Date(`, `performance.now(`, `setTimeout(`;
   - emoji;
   - chữ `lego` hoặc `duplo` trong chữ hiển thị.
5. Nếu giai đoạn đụng tới hình ảnh (`apps/brick-engine`, `apps/video-engine`, `packages/director`): gọi subagent `visual-qa`. Phải nhận được PASS.
6. Điều kiện nào trượt: sửa rồi kiểm lại từ bước 3. Tối đa 3 vòng, sau đó dừng và báo lỗi còn lại.
7. Đạt hết thì:
   - Cập nhật `docs/PROGRESS.md`: trạng thái, ngày, ghi chú cho phiên sau.
   - Chạy `git status` và xem danh sách file. Không được có `.env`, khung render, `.blend`, `workspace/channel_library/baked/` hay `node_modules`.
   - `git add -A && git commit -m "Giai đoạn N: <tóm tắt>"` (kèm dòng Co-Authored-By).
   - Báo người dùng bằng tiếng Việt đơn giản: đã làm gì, cách tự xem kết quả, giai đoạn tiếp theo.
