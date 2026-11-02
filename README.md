# Thành phố Quận 5 Online — Chợ Lớn

Game 3D nhiều người chơi cùng lúc, phong cách nhân vật chibi cute như ảnh tham khảo.
Người chơi đi dạo một thành phố Quận 5 thu gọn theo đúng bố cục đường thật
(Bắc ở trên): Hùng Vương, Trần Hưng Đạo, Nguyễn Trãi, An Dương Vương,
Hải Thượng Lãn Ông, Tháp Mười, Hồng Bàng (Đông–Tây) và Nguyễn Thị Nhỏ,
Lương Nhữ Học, Phùng Hưng, Châu Văn Liêm, Ngô Quyền, Nguyễn Tri Phương,
Nguyễn Văn Cừ (Bắc–Nam).

Landmark trong game: Chợ Bình Tây, Chợ An Đông, Chợ Kim Biên,
Chùa Bà Thiên Hậu, Hội quán Nghĩa An, Công viên Văn Lang,
phố lồng đèn Lương Nhữ Học, phố Đông y Hải Thượng Lãn Ông,
chợ vải Soái Kình Lâm, Bến xe Chợ Lớn, kênh Tàu Hủ.

Sơ đồ trong game là bản thu gọn theo bố cục thật, không phải bản đồ tỉ lệ 1:1.

## Cách chơi

- Mặc định vào thành phố chung `QUAN5`. Nhập mã phòng khác để chơi phòng riêng.
- Di chuyển: phím WASD / mũi tên, hoặc joystick trên điện thoại. Kéo để xoay camera.
- Hành động có sẵn (không có chat tự do): chào, ăn hủ tiếu, cà phê vợt,
  mua lồng đèn, mua sắm, chụp ảnh, check-in địa điểm gần nhất (+10 điểm),
  đổi buổi sáng / hoàng hôn / đêm.
- Bản đồ nhỏ (minimap) ở góc phải cho thấy đường, landmark và vị trí người chơi.

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

- `server.js` — API join / heartbeat / action / state, phòng theo mã.
- `public/index.html` — toàn bộ giao diện 3D (Three.js qua CDN), đường,
  landmark, nhà phố, minimap, nhân vật chibi.
- `quan5-online.service` — file systemd.
- `quan5-snippet.txt` — đoạn cấu hình nginx.
