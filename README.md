# Thành phố Quận 5 Online — Chợ Lớn (bản đồ thật)

Game 3D nhiều người chơi cùng lúc, phong cách nhân vật chibi cute như ảnh tham khảo.
Bản v3 này dùng **bản đồ thật từ OpenStreetMap**, không còn lưới đường thẳng vẽ tay.

## Nguồn bản đồ (OpenStreetMap, ODbL)

- Ranh giới: OSM relation 3820432 (Quận 5), lấy qua Nominatim ngày 2026-11-02.
- Đường: tất cả way `highway` có tên trong khung Quận 5, cắt đúng ranh (1141 đoạn
  polyline, 6098 điểm), vẽ theo đúng hình cong / chéo ngoài đời.
- Nhà: 2552 footprint `building` trong ranh, vẽ bằng InstancedMesh, va chạm theo
  hộp định hướng của từng nhà.
- Kênh / công viên: kênh Tàu Hủ, kênh Bến Nghé, kênh Hàng Bàng và các công viên
  (Văn Lang, Hòa Bình, …) từ OSM.
- Landmark (tọa độ Nominatim, đã kiểm chứng từng điểm): Chợ Bình Tây
  (10.74929, 106.65073), Chợ An Đông (10.75811, 106.67218), Chợ Kim Biên
  (10.75004, 106.65594), Chùa Bà Thiên Hậu / Hội quán Tuệ Thành
  (10.75356, 106.66119), Hội quán Nghĩa An (10.75365, 106.66213),
  Công viên Văn Lang (10.75665, 106.66852), Bến xe Chợ Lớn (10.75121, 106.65187),
  Chợ Hòa Bình (10.75103, 106.67564), Bệnh viện Chợ Rẫy (10.75670, 106.65973),
  cộng phố lồng đèn Lương Nhữ Học và phố Đông y Hải Thượng Lãn Ông lấy theo
  điểm giữa đúng đường đó trên OSM.

## Thỏa hiệp tỉ lệ — nói thẳng

Vị trí, hình dạng và thứ tự các đường, nhà, kênh là thật. Nhưng để chơi được
trên điện thoại, bề rộng đường, chiều cao nhà và kích thước nhân vật được
phóng đại, không đúng tỉ lệ mét ngoài đời. Người chơi cũng không đi ra ngoài
ranh Quận 5 được, và không đi xuyên qua nhà hay đi xuống kênh được.

## Cách chơi

- Mặc định vào thành phố chung `QUAN5`. Nhập mã phòng khác để chơi phòng riêng.
- Di chuyển: phím WASD / mũi tên, hoặc joystick trên điện thoại. Kéo để xoay camera.
- Hành động có sẵn (không có chat tự do): chào, ăn hủ tiếu, cà phê vợt,
  mua lồng đèn, mua sắm, chụp ảnh, check-in địa điểm gần nhất (+10 điểm),
  đổi buổi sáng / hoàng hôn / đêm.
- Bản đồ nhỏ (minimap) ở góc phải cho thấy ranh, đường, kênh, landmark và vị trí người chơi.

## Chạy local / trên VPS (không cần npm)

```bash
node server.js   # mặc định PORT=3102, chỉ bind 127.0.0.1
```

Server chỉ dùng module có sẵn của Node. Dữ liệu phòng / người chơi chỉ giữ
trong RAM, người chơi idle bị gỡ sau ~25 giây.

## Triển khai nginx (tham khảo)

- Systemd: xem `quan5-online.service` (port 3102, `Restart=always`).
- Nginx: xem `quan5-snippet.txt` — thêm `location /quan5/` proxy về
  `http://127.0.0.1:3102/`, trang gốc của site không bị thay đổi.

## Cấu trúc

- `server.js` — API join / heartbeat / action / state, phòng theo mã, phục vụ `quan5-map.json`.
- `public/index.html` — toàn bộ giao diện 3D (Three.js qua CDN), vẽ bản đồ thật,
  va chạm nhà / ranh / kênh, minimap, nhân vật chibi.
- `public/quan5-map.json` — bản đồ đã chuyển từ OSM sang tọa độ game
  (được tạo bởi `build_map.py` từ dữ liệu thô trong `osm/`).
- `build_map.py` — script chuyển OSM → `quan5-map.json` (lọc theo ranh Quận 5).
- `quan5-online.service` — file systemd.
- `quan5-snippet.txt` — đoạn cấu hình nginx.
