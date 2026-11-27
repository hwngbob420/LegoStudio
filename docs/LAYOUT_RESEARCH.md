# Nghiên cứu bố cục thế giới gạch & ngữ pháp máy quay (Giai đoạn 6)

Ngày: 2026-11-27. Phạm vi: tìm mã nguồn mở và kỹ thuật giúp bộ set gạch trông như phim trường thu nhỏ có chiều sâu,
đặt máy quay đủ cỡ cảnh mà không lộ mép trống. Kèm theo đó là cách đưa các nguyên tắc này vào skill Claude Code.

Ràng buộc khi chấm:
- Pipeline phương án C: `packages/director` nướng `baked_timeline.json`, Blender 5.2 EEVEE và Three.js chỉ phát lại.
- Dựng hình bằng code Python tất định (`apps/brick-engine`).
- Không thêm gói npm/pip ngoài MASTER_ADD §3 khi chưa hỏi người dùng.
- Chạy trên Windows.

Số sao lấy qua GitHub API ngày 2026-11-27. Giấy phép ghi "chưa kiểm" là chưa mở file LICENSE.

## 1. Kết luận nhanh

| Lấy gì | Từ đâu | Cách dùng ở LegoStudio |
| :--- | :--- | :--- |
| Bố cục bằng **ràng buộc + bộ giải** (đặt vật theo quan hệ "sát tường", "trước mặt", "không chồng") | Infinigen Indoors, Holodeck, SceneCraft | Không chép code. Tự viết bộ kiểm bố cục TS (`packages/director/src/layout.ts`): vật lơ lửng, chồng hộp, mép trống, che mặt |
| **Ghép mô-đun theo luật kề nhau** (kiểu WFC rút gọn) | mxgmn/WaveFunctionCollapse, marian42/wavefunctioncollapse | Dãy mặt tiền vòng 2 và đường chân trời vòng 3 chọn mô-đun theo luật kề + hạt giống crc32, không dùng thư viện WFC |
| **Ba lớp chiều sâu** (tiền cảnh – trung cảnh – hậu cảnh) | Quy tắc dựng cảnh điện ảnh, thực hành "forced perspective" của mô hình thu nhỏ | Kiến trúc 3 vòng: sân diễn chi tiết, vòng 2 khối phố kề, vòng 3 chân trời + vòm trời khép kín |
| **Gộp lưới theo vật liệu** thay cho instancing | Thảo luận three.js về `EXT_mesh_gpu_instancing` (Blender xuất chưa ổn) | Vòng 2/3 gộp thành vài đối tượng mỗi vật liệu ngay trong builder; cùng một file cho Blender và `.glb` |
| **Lưới máy quay "toric"**: đặt máy theo góc so với 1–2 chủ thể | Lino & Christie (SIGGRAPH 2015), Burg et al. (CGF 2020) | Preset OTS / two_shot / CU tính vị trí theo góc quanh trục nối hai đầu, cùng một hàm toán cho cả hai máy chiếu |
| **Kiểm che khuất bằng tia** | Burg et al. 2020 (bản GPU), rút gọn thành tia–hộp | Bộ kiểm an toàn máy quay: tia từ máy tới mặt không được cắt hộp của gạch đang hiện |
| **Ngữ pháp cỡ cảnh / góc máy** cho skill | DirectorSKILL, video-shotcraft, fal-ai skills (chỉ đọc ý, không chép chữ) | Hai skill tự viết: `brick-world-layout-architect`, `cinematic-camera-blocking` |

## 2. Repo đã xem

### 2.1. Thành phố / mặt tiền thủ tục trong Blender
| Repo | Sao | Giấy phép | Ghi chú | Quyết định |
| :--- | ---: | :--- | :--- | :--- |
| [vvoovv/bcga](https://github.com/vvoovv/bcga) | 99 | chưa kiểm | Kiến trúc kiểu CGA: mỗi luật là một hàm Python nhỏ, chia mặt tiền thành tầng, ô, cửa | **Lấy ý**: chia mặt tiền theo luật tầng → ô → cửa sổ. Không lấy code (gắn với bpy cũ, chưa thấy bản cho Blender 5) |
| [Durman/BuildingNodes](https://github.com/Durman/BuildingNodes) | 19 | chưa kiểm | Add-on dựng nhà từ "tấm panel" (Blender 3.0+) | Bỏ: là add-on giao diện, không chạy được bằng `-b --factory-startup` |
| [josauder/procedural_city_generation](https://github.com/josauder/procedural_city_generation) | 598 | chưa kiểm | Lưới đường + lô đất rồi hiển thị bằng Blender. Tài liệu ghi thành phố 17x19 tốn tới 6 GB RAM | Bỏ: quá nặng, quy mô thành phố thật. Chỉ lấy ý "lô đất theo lưới" cho vòng 3 |
| [princeton-vl/infinigen](https://github.com/princeton-vl/infinigen) | 7.480 | BSD-3 (theo bài báo và infinigen.org) | Infinigen Indoors: ngôn ngữ ràng buộc + bộ giải đặt nội thất, 100% thủ tục. Windows mới thử nghiệm | **Lấy ý**: các vị từ "against_wall", "on_top_of", "no_overlap", "accessible". Không cài (nặng, Linux/macOS, ảnh chân thực chứ không phải gạch) |

### 2.2. Gạch thật / LDraw
| Repo | Sao | Ghi chú | Quyết định |
| :--- | ---: | :--- | :--- |
| [TobyLobster/ImportLDraw](https://github.com/TobyLobster/ImportLDraw) | 380 | Nhập mô hình LDraw vào Blender | Bỏ: thư viện mảnh LDraw mang hình dáng gắn thương hiệu (núm có chữ) và giấy phép riêng. Builder của ta đã có núm trơn, nhẹ hơn |
| [ScanMountGoat/ldr_tools_blender](https://github.com/ScanMountGoat/ldr_tools_blender) | 57 | Nhập LDraw/Studio nhanh (Rust), Blender 4.1+ | Bỏ vì cùng lý do. Ta vẫn **xuất** `.ldr` như cũ để kiểm cấu trúc |
| Bricker (add-on bán phí) | – | Biến lưới thường thành gạch | Bỏ: trả phí, không tất định theo hạt giống |

### 2.3. Ghép mô-đun (Wave Function Collapse)
| Repo | Sao | Ghi chú | Quyết định |
| :--- | ---: | :--- | :--- |
| [mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse) | 25.555 | Bản gốc (C#), mô hình "simple tiled" có luật kề | **Lấy ý** cho dãy mặt tiền 1D: mô-đun (cửa hàng, nhà, ngõ, cây) với luật "được đứng cạnh". Không cần lan truyền 2D/3D đầy đủ |
| [marian42/wavefunctioncollapse](https://github.com/marian42/wavefunctioncollapse) | 4.881 | Thành phố vô tận bằng WFC 3D (Unity) | Tham khảo hình ảnh, không dùng (Unity) |
| [LingDong-/ndwfc](https://github.com/LingDong-/ndwfc) | 340 | WFC n chiều cho trình duyệt/Node | Bỏ: không cần ở phía TS vì set được dựng trong Python |
| [JDihlmann/infty](https://github.com/JDihlmann/infty) | 45 | Demo WFC bằng react-three-fiber | Chỉ tham khảo |

### 2.4. AI / LLM dựng bố cục cảnh 3D
| Dự án | Sao | Ghi chú | Quyết định |
| :--- | ---: | :--- | :--- |
| [allenai/Holodeck](https://github.com/allenai/Holodeck) (CVPR 2024) | 584 | LLM sinh ràng buộc quan hệ rồi bộ tối ưu giải bố cục; cần AI2-THOR (Unity), Objaverse, GPU | Bỏ code. **Lấy ý**: AI chỉ nói "ai ở đâu, cạnh cái gì", code giải toạ độ. Trùng với luật "AI chỉ sinh JSON" của ta |
| SceneCraft (arXiv 2403.01248) | – | LLM viết script Blender, đồ thị cảnh → ràng buộc số → bộ giải, rồi LLM thị giác kiểm vòng lặp | **Lấy ý** vòng kiểm: ta đã có visual-qa + contact sheet; thêm bộ kiểm số học trước khi render |
| LayoutGPT (NeurIPS 2023) | – | LLM xuất bố cục kiểu CSS | Bỏ: các bài sau ghi nhận va chạm và vượt biên thường xuyên. Đây là lý do AI của ta không được viết toạ độ |

### 2.5. Ngữ pháp máy quay và skill Claude
| Nguồn | Sao | Ghi chú | Quyết định |
| :--- | ---: | :--- | :--- |
| [wuwangzhang1216/DirectorSKILL](https://github.com/wuwangzhang1216/DirectorSKILL) | 428 | Skill Claude: kịch bản → shot list có coverage, kiểu đạo diễn | Đọc ý tưởng "coverage" (mỗi cảnh có toàn + trung + cận). Không chép chữ (chưa thấy giấy phép) |
| [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 23.018 | Skill video Remotion, thẻ công thức cảnh | Chỉ đọc cấu trúc "thẻ công thức ngắn". Hướng về quảng cáo sản phẩm, không hợp |
| [fal-ai-community/skills](https://github.com/fal-ai-community/skills) (cinematography) | 275 | Tách tài liệu tham khảo: ngôn ngữ cỡ cảnh, ánh sáng–ống kính | Lấy cách chia skill gọn + tài liệu tham khảo. Tự viết nội dung |
| Lino & Christie, "toric space" (SIGGRAPH 2015); Burg, Lino, Christie (CGF 2020) | – | Tham số hoá vị trí máy theo hai mục tiêu; dự đoán che khuất | **Lấy ý** cho OTS và kiểm che khuất bằng tia (bản CPU tia–hộp, đủ cho vài trăm hộp) |

### 2.6. Hiệu năng xem trước Three.js
- Theo thảo luận trên forum three.js, `EXT_mesh_gpu_instancing` có thể thêm bằng glTF-Transform ([donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform), 2.106 sao, MIT). Nhưng trình xuất của Blender chưa ghi ổn định, và có lỗi khi nhiều loại lưới dùng chung extension.
- **Quyết định:** không thêm gói. Vòng 2/3 được gộp lưới theo vật liệu ngay trong builder (`rings.py`). Một mặt tiền 300 viên gạch còn 3–5 lệnh vẽ, Blender và Three.js thấy đúng cùng một hình.
- Đối tượng sân diễn vẫn giữ tên riêng vì hoạt cảnh lắp ráp cần tên.

## 3. Nguyên tắc đã chưng cất (đưa vào skill và code)

1. **Ba vòng, khép kín.** Mỗi set là một "bát":
   - sân diễn (vòng 1, ~2,6 × 1,9 m) nằm giữa;
   - vòng 2 (khối phố, hành lang, cây, xe) bao 3 phía;
   - vòng 3 (chân trời gạch, bán kính 7–9 m) bao kín 360°;
   - một vòm trời trụ + đĩa nền rộng hơn vòng 3.
   Máy quay luôn ở trong vòm, nên mọi tia nhìn đều chạm một bề mặt: không lộ khoảng trống.
2. **Khoảng cách giữa các set** lớn hơn đường kính vòm. Set này không bao giờ lọt vào khung của set kia.
3. **Mật độ giảm theo khoảng cách.** Vòng 1 là gạch thật có núm. Vòng 2 dùng gạch to, ít chi tiết. Vòng 3 là khối trơn + ô cửa sổ phát sáng, màu pha dần về màu sương theo khoảng cách (sương "nướng" vào màu, không dùng volumetric để giữ tốc độ và parity).
4. **Ràng buộc thay cho toạ độ.** AI chọn `location` (set) + mốc diễn (anchor) + ý đồ hình ảnh. Code giải toạ độ, góc máy, che khuất.
5. **Phân tầng tiền – trung – hậu cảnh.** Mỗi set có ít nhất một vật tiền cảnh mép khung (đèn, cây, quầy) để cảnh rộng có chiều sâu. Tilt-shift đặt khẩu độ theo cỡ cảnh (EWS f/2.8 → ECU f/1.4) để hậu cảnh mờ đúng kiểu mô hình.
6. **Cutaway có chủ đích.** Trần và tường trước đặt trong nhóm `CUT_*`. Bộ đạo diễn ẩn chúng ở cảnh high_angle, birds_eye hoặc khi máy nằm phía ngoài tường.
7. **Kiểm bằng số trước khi render:**
   - vật lơ lửng (không chạm vật nào);
   - tia máy → mặt bị chắn;
   - máy ra ngoài vòm;
   - mặt nằm dưới thẻ chữ hoặc dải phụ đề;
   - đơn điệu cỡ cảnh.
8. **An toàn thương hiệu cho cả hình ảnh.** Biển hiệu, đèn neon, số tuyến xe chỉ dùng chữ chung chung (CAFE, MART, OPEN, 24H, tuyến "7"). Không dùng màu nhận diện của chuỗi cửa hàng hay hãng xe thật. visual-qa phải đọc biển hiệu vì hook chỉ quét chữ.

## 4. Những gì không làm (và vì sao)
- **Không** nhập mảnh LDraw: hình dáng/thương hiệu, giấy phép, nặng.
- **Không** dùng Geometry Nodes: khó xuất `.glb` giữ nguyên kết quả, khó kiểm tất định giữa hai máy chiếu.
- **Không** để LLM xuất toạ độ (bài học LayoutGPT).
- **Không** dùng sương volumetric thật trong EEVEE cho vòng 3: chậm, và Three.js không khớp được. Sương được nướng vào màu vật liệu.
