# Thành phố Quận 5 Online — Chợ Lớn (bản đồ thật, nhà trên nền vàng)

Game 3D nhiều người chơi cùng lúc, phong cách nhân vật chibi cute như ảnh tham khảo.
Bản này dùng **bản đồ thật từ OpenStreetMap**, không còn lưới đường thẳng vẽ tay.
Theo yêu cầu của Boss tối 2026-11-02, nhà 3D đã được dựng lại nhưng **chỉ trên
nền đất vàng, không dựng ra đường**: nhà vẽ bằng đúng footprint thật của OSM
(bản cũ phóng đại tối thiểu 2x2 nên hộp vẽ rộng hơn hành lang đã dọn — đó là lý
do nhìn như nhà tràn ra đường), đã đẩy khỏi hành lang đường, nhà trong công viên
và nhà nhỏ vẫn chồng đường sau khi đẩy đã bị bỏ hẳn, màu nhà trầm đồng tông
nền vàng (không còn cầu vồng pastel). Đường vẽ theo tỉ lệ ×0,15 (sàn 1,0,
trần 3,5) — đủ hẹp để nhà có chỗ đứng giữa hai đường, vẫn tỉ lệ và vẫn đi
vừa hẻm; công thức này phải khớp đúng ở build_map.py và client, nếu không
bản lọc và đường vẽ sẽ không đồng ý với nhau về "cái gì là trên đường".
Va chạm: nhà chặn khi đi ngoài đường; khi đang ở trên đường/cầu thì nhà/kênh
không chặn (lưới an toàn cho các khối lớn như chợ chạm mép đường phóng đại).

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

Vị trí, hình dạng và thứ tự các đường, nhà, kênh là thật. Bề rộng đường tỉ lệ
với bề rộng thật: mỗi đoạn đường mang `width_m` từ OSM (tag width, không có
thì số làn × 3,5m, không có nữa thì mặc định theo loại đường), và trong game
bề rộng = `width_m × 0,3` (sàn 1,8 để nhân vật đi được, trần 6,5) — nên đường
16m rộng gấp đôi đường 8m đúng như ngoài đời. Chiều cao nhà và kích thước
nhân vật vẫn phóng đại để chơi được. Người chơi cũng không đi ra ngoài
ranh Quận 5 được, và không đi xuyên qua nhà hay đi xuống kênh được —
trừ một ngoại lệ có chủ đích để đường nhỏ đi được: khi đang ở trên đường
(trong hành lang đường, tính theo bề rộng game), nhà/kênh không chặn nữa,
vì footprint nhà trên OSM có khi sát tim hẻm chỉ 1–2m ngoài đời; ra khỏi
đường thì va chạm nhà lại chặn như thường. Ngoài ra `build_map.py` còn
đẩy nhà lùi khỏi tim đường gần nhất (tối đa 3 đơn vị) để đường vẽ phóng
đại không bị nhà chồng lên quá nhiều — vị trí nhà trong game vì vậy lệch
khỏi OSM một chút ở phố hẹp.

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
