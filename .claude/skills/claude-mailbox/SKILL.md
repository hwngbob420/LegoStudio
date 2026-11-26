---
name: claude-mailbox
description: Trả lời các việc AI mà Lego Studio Engine gửi vào Hộp thư Claude (workspace/claude_queue) khi .env bật AI_SESSION_QUEUE=1. Dùng khi người dùng nói "xử lý hộp thư", "trả lời Studio", hoặc Studio đang chờ Claude.
---

# Hộp thư Claude

Khi `.env` có `AI_SESSION_QUEUE=1`, server không gọi Gemini. Thay vào đó, mỗi việc AI (phân tích truyện, đạo diễn, dịch phụ đề...) được ghi thành
`workspace/claude_queue/<id>.request.json`, rồi server chờ. Bạn chính là AI trả lời.

1. Liệt kê việc chờ: `curl -s http://127.0.0.1:8788/api/ai/queue`. Hoặc xem các file `*.request.json` chưa có `*.done.json` cùng tên.
2. Đọc `system`, `prompt` và `schema` (JSON Schema mà câu trả lời PHẢI khớp) của từng việc.
3. Viết câu trả lời JSON vào `workspace/claude_queue/<id>.response.json` (chỉ JSON, đúng khuôn).
   - Việc `phan_tich_truyen` và `dao_dien`: làm đúng như lời nhắc. Đọc thêm `workspace/channel_library/series_bible.md` và `catalog.json`.
   - Việc `dao_dien`: mỗi `line` một beat. Không viết thời gian hay toạ độ; code tự lo luật không che mặt.
4. Sai khuôn thì server ghi `<id>.error.txt` liệt kê lỗi. Sửa file `.response.json` theo đó. Đúng khuôn thì server đổi tên thành `.done.json` và chạy tiếp.
5. Không bao giờ đưa tên thương hiệu (lego, duplo) vào chữ hiển thị.
