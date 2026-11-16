# Handoff cho Claude Code — KLU Overcapacity 3D Deck

Nov 15, 2026 · @Ryan

## 1. Bối cảnh và hiện trạng

Dự án là bộ slide web 3D cho bài nhóm "Topic 2: Overcapacity in Container Shipping" (khóa "Connecting the World Across Oceans", giảng viên Rolf): 20 phút nói, 10 phút Q&A, 5 người nói, mỗi người 3 đến 5 phút (Tiến Đức, Aryan, Ryan, Sanjay, Akib). Tiến Đức làm Q1, Q6 và ghép cả deck. Các bạn làm Q2 đến Q5 chưa xong, nên cần một bản khung chạy được, nội dung điền sau.

Claude Code không đọc được link claude.ai riêng tư, vì vậy mọi thứ cần thiết đã được chép vào tài liệu này. Các link dưới đây chỉ để người xem lại:

- [Phân tích đề và storyboard](https://claude.ai/artifact/2FzME4aqDDWXk4VTrJgVrp)
- [Canvas Concept, Sketch và Wireframe](https://claude.ai/artifact/Y3HHCVH4Xf66eizbBPwu3B)
- [Demo chuyển cảnh CSS, đã bị loại](https://claude.ai/artifact/Fgyo3bjHf9iSU4vfc3Z4Ri)

Hiện trạng: dự án mới chưa có dòng mã nào. Thư mục `~/slides3d` (deck Black Pearl) có engine dùng lại được: `package.json`, `index.html`, `src/scene/*`; chỉ đọc, không sửa. Thư mục `~/project-5-scientific-programming-2026` là repo Julia của môn khác, không đụng tới.

## 2. Quyết định đã chốt

- **Repo:** dự án mới trong thư mục riêng, copy engine từ `slides3d`. Không ghi vào repo Julia, không sửa deck Black Pearl.
- **Công nghệ:** Vite, `three` (^0.187), `gsap`, `@gltf-transform/cli`; reveal.js là tùy chọn. Playwright cho QA, Vitest cho test mô hình.
- **Hướng hình ảnh:** theo bản storyboard do Gemini tạo mà Tiến Đức đã gửi: ảnh nền điện ảnh cho từng cảnh, chuyển cảnh bằng shader WebGL giữa hai ảnh, giao diện HUD kính mờ bằng HTML thật.
  **Đổi hướng 2026-11-15 (Tiến Đức):** các cảnh là thế giới 3D chạy trực tiếp (biển có sóng, trời, tàu, camera chuyển động), không phải ảnh tĩnh; phong cách giữ nguyên. Vật thể và cảnh dựng bằng Blender (script trong `scripts/blender/`, xuất GLB, Three.js render); Higgsfield chỉ dùng cho clip chuyển cảnh. Làm prototype cảnh 1 trước (`src/world/hero.js`), duyệt xong mới làm 6 cảnh còn lại. Cảnh 1 được duyệt 2026-11-15; cảnh 2 (`src/world/container.js`) theo storyboard "Hyper-Zoom" (sửa 2026-11-15): một lần bấm → ở cảnh 1 camera bay từ góc xa tới thùng cam HAPAG-LLOYD gần mũi tàu (`leadOut` trong `s01-hero.js`, `FLY` trong `hero.js`), zoom blur, rồi container cảnh 2 (đặt trong chồng thùng trên boong tàu đỏ, `STACK` trong `container.js`) — camera nhìn hông thùng như khung cuối cảnh 1, vòng ra cửa, cửa mở và camera đi vào trong (`arrive` → `goInside`). Camera bay đều không dừng, và thế giới cảnh 1 vẫn chạy trong lúc blur (`liveFrom`); mỗi thế giới 3D được render nháp một lần lúc tải để không giật khi biên dịch shader; các bước của cảnh 2 đều ở bên trong. Bỏ khung ngắm và TAP TO INSPECT. Không dùng số "7.24M TEU / 28%" của storyboard (AI bịa). Từ 2026-11-15 cảnh 1 dùng tàu "Container Ship" của RM02 (Sketchfab, CC-BY-4.0, đã đổi nhãn bằng `scripts/rebrand_rm02.py`, Tiến Đức chọn giữ); bắt buộc ghi credit trên slide (xem `docs/third-party-assets.md`). Tàu Blender (`public/models/ship.glb`) vẫn dùng cho tàu chạy ngang trong cảnh 2. Ảnh nền tĩnh giữ làm bản dự phòng cho tier low và máy không có WebGL.
- **Bản demo CSS 3D bị loại:** Tiến Đức không thích giao diện và cách chuyển cảnh của nó (các khối phẳng, không ánh sáng). Chỉ giữ ý tưởng mở cửa container cho cảnh Blender (phần 6, phase 6).
- **Chi phí:** ưu tiên miễn phí. Ảnh nền do Tiến Đức tạo bằng Gemini. Higgsfield được dùng cho clip chuyển cảnh và ảnh Gemini không làm được, trong ngân sách credit do Tiến Đức đặt. Tài khoản free hiện có 10 credit (kiểm tra ngày 15/11/2026), chưa biết giá mỗi clip, nên Claude Code phải báo giá và hỏi trước mỗi lần tạo. Không tạo tài khoản phụ để lấy credit.
- **Blender:** chỉ cho một cảnh chủ chốt (mở cửa container rồi bay xuyên qua), render thành clip ngắn. Chỉ làm nếu máy đã cài Blender và các phase trước xong sớm.
- **Figma:** tùy chọn, để Tiến Đức tự tinh chỉnh HUD. Mặc định dựng HUD thẳng bằng HTML.
- **Quy tắc nội dung:** mỗi cảnh đọc từ một file JSON riêng; nội dung chưa chốt hiện dấu SAMPLE DATA; build cuối bị chặn nếu còn số sample hoặc chưa xác minh.
- **Màu:** cam `#F37021` = cung, cyan `#00F0FF` = cầu, đỏ `#FF3333` = rủi ro, Marine Blue `#002C5F` = nền panel HUD, Midnight `#0A1118` = nền. Font: Montserrat 800 in hoa cho tiêu đề, Fira Code cho số và nhãn, Inter cho câu dẫn phụ ở cảnh 1. Cảnh 1 có bố cục hero riêng (`layout: "hero"` trong content/s01.json, hướng A được chọn 2026-11-15): chữ OVERCAPACITY rất lớn màu tối nằm trên bầu trời phía sau con tàu (vẽ trong thế giới 3D, tàu che chữ bằng stencil, `src/world/hero.js`), câu hỏi và tên nhóm ở góc dưới trái, không có ô viền. Tier low và bản không WebGL dùng bản HTML của tiêu đề.
- **Logo:** không dùng file logo Hapag-Lloyd trên HUD, chỉ dùng chữ "Hapag-Lloyd". Chữ trên slide là tiếng Anh.
  Cập nhật 2026-11-15 (Tiến Đức): tên "HAPAG-LLOYD" được phép xuất hiện trên thân tàu trong ảnh nền s01, s03, s07
  (bài thuyết trình trong lớp do Hapag-Lloyd giảng dạy). s04 dùng bản đồ thật (Natural Earth) để highlight chính xác.

## 3. Nhiệm vụ nhóm và quy tắc số liệu

Tiến Đức nói tổng 5 phút (2 phút + 3 phút), bốn bạn còn lại mỗi người 3,5 đến 3,75 phút, tổng khoảng 19 đến 20 phút.

| Câu | Chủ đề | Người phụ trách | Trạng thái |
| --- | --- | --- | --- |
| Q1 | Orderbook và các nguyên nhân | Tiến Đức | Mới có hai số đã xác minh (bên dưới) |
| Q2 | Cầu | Chưa gán (A) | Bạn chưa xong |
| Q3 | Gián đoạn (Biển Đỏ, Suez) | Chưa gán (B) | Bạn chưa xong |
| Q4 | Bình thường hóa | Chưa gán (C) | Bạn chưa xong |
| Q5 | Phản ứng của hãng tàu | Chưa gán (D) | Bạn chưa xong; chưa xác minh trang gốc |
| Q6 | Kịch bản lạc quan, cơ sở, bi quan đến 2030 | Tiến Đức | Cần mô hình (phase 5) |

**Số liệu đã xác minh:** orderbook hơn 14 triệu TEU, khoảng 42% đội tàu hiện có (BIMCO, tháng 9/2026, qua Maritime Executive). Tiến Đức nên đối chiếu lại cách diễn giải "42% của đội tàu hiện có" với bản gốc.

**Số không được dùng:** "7.24M TEU, 28% of Fleet" trong ảnh storyboard Gemini là số do AI tạo, trái với số BIMCO. Mọi số khác chưa có nguồn đều phải đánh dấu `unverified` hoặc `sample`. Hai trang trans.info và Seatrade đã thử mở nhưng không đọc được, nên các số từ đó vẫn chưa xác minh.

**Giả thuyết làm việc:** dư cung bị che bởi gián đoạn tuyến đường và lộ ra khi thị trường bình thường hóa, khoảng 2027 đến 2029. Định nghĩa tạm của "structural": dư cung có gốc ở phía cung, kéo dài hơn một chu kỳ, và các biện pháp của hãng tàu chỉ xử lý được một phần. Cả nhóm cần đồng ý định nghĩa này.

## 4. Storyboard 7 cảnh

Bản gộp storyboard gốc (7 cảnh) với ý tưởng từ ảnh Gemini. Người nói cho Q2 đến Q5 là giả định, cần chốt với nhóm.

| # | Cảnh (người nói) | Thông điệp | Chuyển cảnh vào | Nền hình | HUD và tương tác |
| --- | --- | --- | --- | --- | --- |
| 1 | Hero (Tiến Đức) | Overcapacity in container shipping: câu hỏi của cả bài | Mở đầu: camera quét quanh con tàu từ trên cao | Tàu container lúc hoàng hôn, biển tối | Tiêu đề, dải tên 5 thành viên dạng container; phím mũi tên để tiếp |
| 2 | Orderbook, Q1 (Tiến Đức) | Nguồn cung đã được đặt hàng: 14M+ TEU, khoảng 42% đội tàu (BIMCO) | Lao vào container cam có nhãn "Q1", cửa mở, xuyên qua (zoom blur; clip Blender nếu có) | Bên trong container nhìn ra ánh sáng | Số lớn, 3 thẻ nguyên nhân, biểu đồ giao tàu theo năm (SAMPLE) |
| 3 | Cầu, Q2 (bạn A) | Cầu tăng bao nhiêu và vì sao không theo kịp cung | Vệt laser cyan (`laserScan`) | Đã dựng 3D (2026-11-16, `src/world/port.js`): bến container lúc chạng vạng, cẩu STS quét laser, tàu cập bến, bãi container | Bước 0 toàn cảnh; bước 1 container rơi xuống thành 2 dãy cột theo năm 2026–2030 (cam = net fleet growth, cyan = port throughput growth, 1 thùng = 1 điểm %, số lấy từ `chart.series` trong `content/s03.json`, hiện là Drewry CF Issue 2 qua bản tóm tắt, chưa kiểm bản gốc, giữ status sample đến khi bạn Req 2 xác nhận); bước 2 nhìn từ trên cao. Khởi động lạnh giờ khoảng 8 s (tải và render nháp 3 thế giới 3D) |
| 4 | Gián đoạn và bình thường hóa, Q3 và Q4 (bạn B và C) | Gián đoạn che dư cung, bình thường hóa làm nó lộ ra | Radar xoay thành địa cầu nhìn từ trên xuống | Bản đồ nhiệt, tuyến Suez và vòng Mũi Hảo Vọng | Cảnh báo đỏ "Capacity absorbed due to routing"; hai panel 4A, 4B; nút REOPEN SUEZ (click); đồng hồ Plimsoll |
<!-- Cảnh 4 đã dựng 3D (2026-11-16, `src/world/map.js`): bản đồ biển từ đường bờ Natural Earth thật, tuyến Suez (đỏ khi đóng) và tuyến Mũi Hảo Vọng (hổ phách), 4 bước: 0 Suez đóng và 1,6 M TEU bị hấp thụ (Taylor 2026), 1 khoảng 250 tàu vẫn vòng Mũi Hảo Vọng (Linerlytica), 2 nút REOPEN SUEZ (bấm hoặc →), 3 Suez mở: BIMCO −5 điểm % và ~−10%. Số đều để status sample đến khi bạn B, C và Req 3-4 xác nhận; tuyến vẽ schematic, không phải dữ liệu hàng hải. -->
| 5 | Phản ứng hãng tàu, Q5 (bạn D) | Hãng tàu điều chỉnh như thế nào: chạy chậm, phá dỡ tàu | Lặn xuống mặt nước, bọt nước phủ lên | Chân vịt đồng dưới nước | Hai thẻ chế độ "Slow steaming" và "Scrapping" (click để chọn), dấu SAMPLE DATA |
<!-- Cảnh 5 đã dựng 3D (2026-11-16, `src/world/prop.js`; chân vịt dựng bằng Blender `scripts/blender/build_propeller.py` → `public/models/propeller.glb`, chạy `npm run build:propeller`): chân vịt đồng 5 cánh dưới nước, tia sáng từ mặt nước, bong bóng. 5 bước, mỗi bước một phản ứng (Req 5): fleet management, network design, slow steaming (chân vịt quay chậm), scrapping (chân vịt cũ, xỉn), consolidation (thêm hai chân vịt). Chỉ 2 con số có nguồn (trong data_scrapping.py): trượt giao tàu 0-25% là ESTIMATE, phá dỡ 2025 là 0,008 M TEU (Alphaliner). Ba bước còn lại hiện dòng "No sourced figure yet" cho đến khi bạn D gửi số. Tất cả status sample. -->
| 6 | Kịch bản 2030, Q6 (Tiến Đức) | Ba kịch bản: lạc quan, cơ sở, bi quan | Đâm xuyên kính buồng lái | Buồng lái ban đêm, 3 màn hình cong | 3 đòn bẩy (cầu, gián đoạn, phá dỡ tàu) với các mức đặt sẵn; nút "Show assumptions"; số ghi \[MODEL\] đến khi mô hình chạy |
<!-- Cảnh 6 đã dựng 3D (2026-11-16, `src/world/bridge.js`): buồng lái ban đêm, ba màn hình cong vẽ đầu ra của model Req 6 từ `public/data/scenarios.json` (xuất từ `simulate.py`, 5.000 lần chạy, seed 42, 6/11/2026; kịch bản = trung vị các lần chạy quanh P90/P50/P10 của utilization index 2030, kèm bảng giả định). 4 bước: 0 bảng đầu vào và định nghĩa optimistic, 1 biểu đồ quạt (đỉnh +13,7 pp năm 2028), 2 ba kịch bản + nút Show assumptions, 3 signposts và giới hạn. Nhãn status là `model` (không phải sample, nên không có watermark; `check:content` vẫn báo vì chưa `verified`). Khi sửa số trong model, chạy lại và cập nhật file JSON và `content/s06.json`.Buồng lái (phòng, bàn điều khiển cong, ghế, khung màn hình) dựng bằng Blender `scripts/blender/build_bridge.py` → `public/models/bridge.glb` (`npm run build:bridge`); bán kính, góc và chiều cao màn hình phải khớp `ARC` trong `bridge.js`. -->
<!-- Cảnh 7 đã dựng 3D (2026-11-16, `src/world/harbour.js`): cảng lúc bình minh nhìn từ sông, dãy kho gạch đầu hồi bậc thang, mái đồng, tháp, gác chuông phía sau và bến container có 5 cần cẩu, dựng bằng Blender `scripts/blender/build_harbour.py` → `public/models/harbour.glb` (`npm run build:harbour`; kiểu kho cảng Bắc Đức, không chép tòa nhà thật nào). Tàu `ship.glb` (có chữ HAPAG-LLOYD trên thân, được phép ở s07) vào từ bên phải và chậm dần rồi dừng trước cần cẩu mỗi lần vào cảnh (`arrive`). 1 bước, không có số liệu. -->
| 7 | Kết luận và Q&A (cả nhóm) | Dư cung có phải mang tính cấu trúc không | Cập cảng Hamburg lúc bình minh | Cảng Hamburg, cẩu và kho gạch | 3 ý chính, slide dự phòng (phím B) |

Quy tắc chung: mỗi chuyển cảnh tối đa 4 giây và bỏ qua được bằng phím S. Không có thao tác hover; chỉ dùng phím mũi tên, click và các nút lớn, vì bài trình bày trên máy chiếu và khán giả không nhìn thấy con trỏ.

## 5. Kiến trúc kỹ thuật

Một trang web ba lớp chồng lên nhau: lớp ảnh nền và chuyển cảnh WebGL ở dưới, lớp HUD HTML ở trên, và dữ liệu nội dung trong các file JSON.

- **Lớp nền:** một canvas Three.js full màn hình vẽ hai texture (ảnh cảnh hiện tại và cảnh kế) qua một shader chuyển cảnh có biến `uProgress`. Khi đứng yên có Ken Burns nhẹ và hiệu ứng nghiêng theo chuột để ảnh có chiều sâu.
- **Shader chuyển cảnh:** 1 đến 2 zoom blur lao vào điểm sáng; 2 đến 3 đường quét laser; 3 đến 4 radar xoay; 4 đến 5 bọt nước và khúc xạ; 5 đến 6 đâm xuyên kính; 6 đến 7 mờ dần khi cập cảng. Tối đa 4 giây, bỏ qua được. Nếu một chuyển cảnh có clip (từ Blender hoặc Higgsfield) thì phát clip đó thay vì shader, và giữ shader làm dự phòng khi clip không phát được.
- **Lớp HUD:** HTML và CSS phủ lên canvas, gồm thẻ kính mờ, số lớn, đồng hồ, thanh trượt, cảnh báo đỏ. Chữ và số lấy từ JSON, không nướng vào ảnh.
- **Scene contract:** mỗi cảnh là một module `{id, title, speaker, init(ctx), enter(timeline), exit(timeline), update(dt), dispose()}`.
- **JSON nội dung mỗi cảnh:** `owner`, `headline` (tối đa 12 từ), `keyNumbers` (tối đa 3; mỗi số có `value`, `unit`, `label`, `source`, `url`, `date`, `status` là `verified`, `unverified` hoặc `sample`), `chart`, `bullets`, `theory`, `case`, `speakerNotes`.
- **Chặn build cuối:** lệnh `npm run check:content` thất bại nếu còn số `sample` hoặc `unverified` hoặc còn watermark SAMPLE DATA. Nội dung chưa xong hiện huy hiệu CONTENT PENDING.
- **Mô hình Q6:** hàm thuần JS `forecast({demandGrowth, disruption, scrapping, slowSteaming, years})`, giả định trong `assumptions.json`, Monte Carlo có seed (mulberry32), test bằng Vitest. Buồng lái gọi hàm này.
- **Điều khiển trình bày:** mũi tên hoặc click để tiến lùi, S bỏ qua chuyển cảnh, B slide dự phòng, T đồng hồ đếm giờ, phím 1 đến 7 nhảy cảnh.
- **Độ bền:** ba mức chất lượng (low, med, high) chọn theo máy; nếu không có WebGL thì hiện ảnh tĩnh với chuyển mờ CSS; font tự host để chạy offline.

## 6. Các công đoạn

Phase 0 và 1 chạy trước. Phase 2 (ảnh nền) làm song song với phase 1. Phase 6 chỉ làm nếu các phase còn lại xong sớm.

| Phase | Việc | Ai làm | Đầu ra | Xong khi |
| --- | --- | --- | --- | --- |
| 0. Chuẩn bị | Đo cấu hình máy (CPU, GPU, RAM), kiểm tra Node và Blender, tạo repo mới, copy engine từ slides3d | Claude Code | Repo chạy được `npm run dev`, báo cáo máy, chọn mức chất lượng | Trang trống chạy được |
| 1. Khung | 7 cảnh với ảnh nền tạm màu đơn, điều hướng, đồng hồ, JSON nội dung, watermark SAMPLE, `check:content` | Claude Code | Chạy hết 7 cảnh bằng phím | Đi từ cảnh 1 đến 7 và quay lại không lỗi |
| 2. Ảnh nền | Tạo 7 ảnh bằng Gemini theo phần 7, tỉ lệ 16:9 | Tiến Đức | `public/plates/s01.jpg` đến `s07.jpg` | 7 ảnh cùng phong cách, không chữ, không logo |
| 3. Chuyển cảnh WebGL | Shader, nghiêng theo chuột, Ken Burns, nén ảnh | Claude Code | 6 chuyển cảnh, mỗi cái tối đa 4 giây, bỏ qua bằng S | Đủ khung hình mượt ở mức chất lượng đã chọn, đo trên máy của Tiến Đức |
| 4. HUD | Thẻ kính mờ, số lớn, đồng hồ, thanh trượt, cảnh báo đỏ | Claude Code (Figma tùy chọn) | Bộ component HUD | Cỡ chữ đạt chuẩn wireframe ở 1920×1080: số từ 64px, tiêu đề từ 40px, nội dung từ 28px, nguồn từ 18px |
| 5. Mô hình Q6 | `forecast`, `assumptions.json`, Monte Carlo, test, nối vào buồng lái | Claude Code và Tiến Đức (giả định) | Mô hình và test | Test xanh; ba kịch bản ra số, mỗi giả định có nguồn |
| 6. Cảnh Blender (tùy chọn) | Script dựng cảnh, render clip mở cửa container | Claude Code và Tiến Đức | Clip tối đa 4 giây, dung lượng nhỏ | Clip chạy mượt khi nhúng vào chuyển cảnh 1 đến 2 |
| 7. Điền nội dung | Nhận JSON của các bạn, xác minh số liệu, bỏ watermark SAMPLE | Tiến Đức và các bạn | JSON có `status: verified` | `check:content` xanh |
| 8. QA và tập | Playwright chụp từng cảnh, chạy trọn deck, đo thời gian từng người, làm bản dự phòng (video quay màn hình và PDF), thử máy chiếu, build chạy offline | Claude Code và cả nhóm | Bản build offline và bản dự phòng | Chạy trọn 20 phút trên máy sẽ dùng thật |

**Công cụ kết hợp và phân việc:**

- **Gemini (miễn phí):** ảnh nền ở phase 2.
- **Higgsfield (tính credit):** (a) clip chuyển cảnh 3 đến 5 giây giữa hai ảnh liền kề, ưu tiên 1 sang 2 và 5 sang 6; (b) ảnh bổ sung nếu Gemini không ra. Trước mỗi lần tạo: kiểm tra số dư, báo giá, hỏi Tiến Đức, dừng nếu vượt ngân sách. Bắt đầu bằng một clip thử (cảnh 1 sang 2) rồi mới tạo thêm. Lưu clip trong `public/clips/`, nén bằng ffmpeg cho nhẹ. Claude Code cần Higgsfield MCP được kết nối trên máy; nếu chưa có, Tiến Đức tạo clip trên trang Higgsfield rồi tải vào thư mục này.
- **Blender (miễn phí):** clip mở cửa container ở phase 6; có thể thay bằng clip Higgsfield nếu Blender tốn công.
- **Figma (miễn phí):** tùy chọn, để Tiến Đức tinh chỉnh HUD ở phase 4.

Ngân sách credit tối đa cho Higgsfield: chưa đặt, Tiến Đức cần chốt trước khi bắt đầu phase 3.

## 7. Prompt tạo ảnh nền bằng Gemini

Dán đoạn phong cách chung trước mỗi prompt cảnh. Mỗi cảnh tạo 2 đến 3 bản rồi chọn một. Lưu tên `s01.jpg` đến `s07.jpg`, tỉ lệ 16:9, độ phân giải cao nhất có thể. Nếu Gemini tự thêm chữ hoặc logo vào ảnh, tạo lại.

```text
Cinematic key art, 16:9, photoreal 3D render look, ultra-detailed, volumetric light, shallow depth of field. Palette: deep midnight navy (#0A1118) and marine blue (#002C5F), warm orange (#F37021) as the accent for cargo, cyan (#00F0FF) glow for data. No text, no letters, no numbers, no logos, no watermarks, no people. Leave the left third of the frame calm and darker for UI panels.
```

1. **Hero:** Aerial three-quarter view of a huge container ship at dusk on a calm dark sea, containers stacked in muted blue and grey with a few orange ones, a long wake behind, orange glow on the horizon.
2. **Orderbook:** Looking out from inside an open shipping container: dark corrugated steel walls converge toward a bright opening, soft cyan-white light pouring in, faint sea horizon in the distance.
3. **Demand:** Container terminal at night, tall gantry cranes lifting containers, long rows of stacks, cyan light strips on the cranes, wet ground with reflections.
4. **Chokepoints:** Top-down dark world map made of glowing dots, shipping lanes as thin orange lines, the Red Sea and Suez region glowing red, cyan radar rings, small node markers on chokepoints.
5. **Carrier responses:** Underwater view of a large bronze ship propeller and rudder from the side, sunlight rays from the surface, rising bubbles, deep blue and teal water.
6. **Scenarios:** Ship bridge cockpit at night, three large curved screens showing abstract glowing charts with no readable text, panoramic windows onto a dark sea, a console with levers, cyan and orange glow.
7. **Arrival:** Hamburg harbour at dawn seen from the river, a container ship arriving, silhouettes of container cranes, brick warehouse district in the distance, soft golden haze.

## 8. Việc còn mở và rủi ro

Các việc dưới đây chưa có câu trả lời, Tiến Đức cần chốt hoặc hỏi người liên quan:

- [ ] Ngày thuyết trình và hạn chót nộp slide (chưa biết)
- [ ] Máy chiếu và laptop sẽ dùng, độ phân giải, có WebGL chạy mượt không
- [ ] Gán tên bạn cho Q2 đến Q5 (A đến D)
- [ ] Hỏi thầy Rolf về tiêu chí chấm và hình thức nộp slide
- [ ] Cả nhóm đồng ý định nghĩa "structural" (phần 3)
- [ ] Xác minh các số "chưa xác minh" từ trang gốc (trans.info và Seatrade đã thử mở nhưng lỗi)
- [ ] Đối chiếu cách diễn giải "42% đội tàu hiện có" với bản gốc BIMCO
- [ ] Máy đã cài Blender chưa, cấu hình CPU và GPU (phase 0 sẽ đo)

Rủi ro chính:

- **Bạn bè giao nội dung trễ:** deck vẫn chạy được nhờ JSON và dấu SAMPLE, nhưng build cuối bị chặn cho đến khi số liệu được xác minh.
- **Ảnh AI lỗi chữ hoặc logo:** tạo lại ảnh; chữ và số luôn là HTML, không nằm trong ảnh.
- **Hiệu năng trên máy chiếu:** có ba mức chất lượng và chế độ dự phòng không WebGL; thử trên máy thật ở phase 8.
- **Mạng ở phòng học:** build phải chạy offline, font tự host.
- **Sự cố khi đang nói:** luôn có bản dự phòng (PDF và video quay màn hình) và phím B mở slide dự phòng.

## 9. Prompt dán vào Claude Code

Lưu tài liệu này thành `HANDOFF.md` trong thư mục dự án mới (xuất Markdown từ tài liệu), rồi dán prompt sau vào phiên Claude Code mới:

```text
Read HANDOFF.md in full before doing anything. It is the brief for a 3D web slide deck for a university group presentation (topic: overcapacity in container shipping).

Do Phase 0 and Phase 1 only, then stop and show me the result.

Phase 0: profile this machine (CPU, GPU, RAM, Node version, whether Blender is installed) and report it to me. Create a NEW project folder. Copy the reusable engine from ~/slides3d (package.json, index.html, src/scene/*) into it. Do not modify ~/slides3d or ~/project-5-scientific-programming-2026.

Phase 1: build the skeleton of 7 scenes with solid-colour placeholder backgrounds, keyboard navigation (arrows, S skip, B backup, T timer, 1-7 jump), per-scene JSON content files with SAMPLE DATA watermarks, and the npm run check:content script that fails when any sample or unverified content remains.

Rules: only the two BIMCO numbers in section 3 are verified; never invent other figures, mark them sample. No Hapag-Lloyd logo. Slide text in English. No hover-only interactions. Tools: besides the plates I supply (made in Gemini), you may use Blender if installed and Higgsfield (through its MCP, if connected) for short transition clips between two plates. Before every Higgsfield generation check the balance, quote the cost and ask me; start with ONE test clip (scene 1 to 2) and never exceed the credit budget I set. Ask me before installing system software or deleting anything.
```
