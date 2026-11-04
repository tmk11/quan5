# Thành phố Quận 5 Online — Chợ Lớn (bản đồ thật, nhà trên nền vàng, kinh tế nhà ở)

Game 3D nhiều người chơi cùng lúc, phong cách nhân vật chibi cute như ảnh tham khảo.
Bản này dùng **bản đồ thật từ OpenStreetMap**, không còn lưới đường thẳng vẽ tay.
Nhà 3D **chỉ trên nền đất vàng, không dựng ra đường**: nhà vẽ bằng đúng footprint
thật của OSM, đã đẩy khỏi hành lang đường, nhà trong công viên và nhà nhỏ vẫn
chồng đường sau khi đẩy đã bị bỏ hẳn, màu nhà trầm đồng tông nền vàng.
Đường vẽ theo tỉ lệ ×0,25 (sàn 1,8, trần 5,0) — đủ rộng cho nhiều người đi cùng
nhau (đường 8m rộng 2,0, đường 16m rộng 4,0), vẫn tỉ lệ; công thức này phải khớp
đúng ở build_map.py và shared-core.js, nếu không bản lọc và đường vẽ sẽ không đồng ý
với nhau về "cái gì là trên đường". Đánh đổi: đường càng rộng thì nhà còn lại
càng ít (474/2552 với đường ×0,25) — nhà không vừa lô vàng thì bỏ, không vẽ
lên đường. Va chạm: nhà chặn khi đi ngoài đường; khi đang ở trên đường/cầu
thì nhà/kênh không chặn.

## Kinh tế nhà ở v1 (2026-11-02 tối, giữ nguyên luật ở v1.1)
- Tiền trong game (không phải tiền thật). Người mới bắt đầu với 100.000đ,
  check-in landmark +5.000đ (cộng thêm +10 điểm như cũ).
- Giá nhà từ diện tích footprint thật: 20.000 + diện tích(m2)×300, làm tròn
  nghìn, sàn 20.000, trần 1.000.000. Nhà phố nhỏ ~45.000đ, khối lớn tới 1.000.000đ.
- Đi lại gần một ngôi nhà (cách mép nhà < 4 đơn vị game) sẽ hiện nút Mua (nếu chưa có chủ),
  Bán (nếu là của mình, nhận lại 80% giá mua), Đặt làm nhà chính (nếu là của mình).
  Mua nhà xong thì nhà đó thành nhà chính, lần sau vào lại sẽ spawn ngay ngoài
  nhà chính. Nhà đã bán hiện bảng tên "Nhà của <tên>" cho mọi người thấy.
- Nhà và tiền gắn với deviceId ở localStorage của trình duyệt, lưu bền trong
  `economy.json` trên VPS — restart server không mất. v1 chưa có mật khẩu:
  ai dùng cùng thiết bị thì dùng chung ví, xóa localStorage là mất ví.
  Phòng chỉ là kênh chơi riêng, còn nhà và tiền là chung toàn thành phố.
- Nếu một ngôi nhà bị bỏ khỏi bản đồ trong lần cập nhật sau, chủ được hoàn
  đúng giá đã mua và nhà bị xóa khỏi sổ (không mất tiền oan).
- Từ v1.1, server kiểm tra khoảng cách thật khi giao dịch: mua/bán/đặt nhà chính
  yêu cầu người chơi trong 6 đơn vị game từ mép nhà (client hiện nút ở < 4,
  server cho thêm dung sai do heartbeat 400ms), check-in yêu cầu trong 30 đơn vị
  game từ landmark (client hiện nút ở < 22). Gọi API trực tiếp từ xa không
  còn farm được tiền nhà hay tiền check-in.

## Nguồn bản đồ (OpenStreetMap, ODbL)

- Ranh giới: OSM relation 3820432 (Quận 5), lấy qua Nominatim ngày 2026-11-02.
- Đường: tất cả way `highway` trong khung Quận 5, cắt đúng ranh, kể cả đường
  không tên, hẻm và lối đi bộ (1913 đoạn polyline, 9500 điểm). Dải đông nhất
  (lon 106,678–106,688) có thể thiếu một phần đường không tên do Overpass 502,
  đường có tên ở đó đã đủ.
- Nhà: 2552 footprint `building` trong ranh, sau lọc nền vàng còn 474 nhà,
  vẽ bằng InstancedMesh, va chạm theo hộp định hướng của từng nhà.
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
bề rộng = `width_m × 0,25` (sàn 1,8 để nhân vật đi được, trần 5,0) — nên đường
16m rộng gấp đôi đường 8m đúng như ngoài đời. Chiều cao nhà và kích thước
nhân vật vẫn phóng đại để chơi được. Người chơi cũng không đi ra ngoài
ranh Quận 5 được, và không đi xuyên qua nhà hay đi xuống kênh được —
trừ một ngoại lệ có chủ đích để đường nhỏ đi được: khi đang ở trên đường
(trong hành lang đường, tính theo bề rộng game), nhà/kênh không chặn nữa,
vì footprint nhà trên OSM có khi sát tim hẻm chỉ 1–2m ngoài đời; ra khỏi
đường thì va chạm nhà lại chặn như thường. Ngoài ra `build_map.py` còn
đẩy nhà lùi khỏi tim đường gần nhất (tối đa 4 đơn vị) để đường vẽ phóng
đại không bị nhà chồng lên quá nhiều — vị trí nhà trong game vì vậy lệch
khỏi OSM một chút ở phố hẹp.

## Nâng cấp HUD + đồ họa v1.3 (2026-11-04) — Top Bar, shophouse, nhân vật, marker

- HUD mobile mới: Top Status Bar kính mờ mỏng sát mép trên (tiền,
  điểm, check-in, người chơi, buổi, nhà chính trên desktop), nút
  "🔗 Mời bạn" nhỏ góc trên (bấm là copy link phòng + toast, không còn
  khung link chiếm đỉnh màn hình), street pill dưới top bar, minimap
  gọn góc phải (chạm mở modal bản đồ lớn, đóng bằng ✕ hoặc chạm ngoài),
  feed dưới top bar, joystick góc dưới trái không panel nào đè lên,
  Quick Dock thu gọn (một nút "⚡ Thao tác" mở panel 7 thao tác chung),
  Contextual Popup chỉ hiện khi gần landmark (check-in) hoặc gần nhà
  (mua/bán/đặt nhà chính). Nút Mời bạn nhấp nháy khi chỉ có một mình.
- Đồ họa: lòng đường nhựa + vạch kẻ mọi đường (lớn dày, hẻm mỏng),
  vỉa hè hai bên đường đủ rộng, quảng trường gạch nung dưới mỗi chợ,
  shophouse mái ngói dốc (nhà lớn giữ mái bằng), ban công mỗi tầng,
  biển hiệu dọc đỏ/vàng (một phần ba nhà phố + nhà thương mại), cây
  ven đường lớn (tối đa 120, không chồng nhà/kênh/đường), dây lồng đèn
  ở phố lồng đèn và các chợ (chỉ dựng khi trong ranh, cột khử trùng),
  xe đẩy hủ tiếu ở chợ và bàn cà phê vợt ở Văn Lang + An Đông (đạo cụ
  trang trí cạnh landmark, không phải vị trí thật đã kiểm chứng, không
  đưa vào va chạm để không kẹt người chơi). FogExp2 thay Fog tuyến tính.
- Ánh sáng/buổi: chuyển buổi lerp mượt (trời, sương, mặt trời, hemisphere
  và vị trí mặt trời), đêm xuống lồng đèn + biển hiệu + đèn đường phát
  sáng dần, đèn quảng trường PointLight ấm chỉ ở các chợ.
- Nhân vật: chân/tay tách biệt, nón lá, tỉ lệ mới cao ~2,8, đi thì vung
  tay chân + nhún, đứng yên thì thở nhẹ, xoay người lerp theo joystick,
  tư thế mới an/cafe/mua (đồng bộ qua heartbeat, server validate pose
  mở rộng) với đạo cụ cầm tô/ly/lồng đèn/máy ảnh. Nhãn đường nhỏ lại
  (4,2) và chỉ hiện 2 giây rồi mờ dần, tên người chơi co giãn theo
  khoảng cách camera (0,75-1,5 lần).
- Marker + juiciness: pin 3D nhấp nhô + vòng sáng pulse ở mọi landmark,
  vòng sáng dưới nhà đang gần (vàng = rao bán, xanh = nhà mình, xám =
  nhà người khác) + biển "BÁN" trên nhà chưa có chủ, chữ bay (+10⭐
  +5.000đ, +điểm, -/+tiền mua bán) và hạt nổ cho cả hành động của mình
  lẫn của người khác (qua event poll, bỏ qua event cũ lúc mới vào).
- Không đổi luật chơi, không đổi API (chỉ mở rộng pose validate).
  Sửa lỗi v1.3 phát hiện qua kiểm tra trình duyệt ngày 2026-11-04:
  popup ngữ cảnh không hiện do đặt style.display = '' trong khi CSS
  #ctxPopup có display:none (đã sửa thành 'block' tường minh, cùng lỗi
  ở nút Thử lại bản đồ), cây ven đường gần như không có do đặt theo
  từng đoạn OSM ngắn (đã sửa thành đi dọc cả tuyến, 25 đơn vị một cây),
  và cột đèn đường đã dựng thật (đi dọc tuyến lớn, 30 đơn vị một cột,
  bóng đèn phát sáng về đêm) thay vì chỉ có vật liệu chưa dùng.
  Sửa tiếp sau kiểm tra lần 2: ngưỡng cây/đèn hạ từ 3,5 xuống 2,5 vì
  đường gần spawn (An Dương Vương, Hùng Vương) chỉ rộng 2,62 trong
  game nên ngưỡng cũ loại gần hết đại lộ; vòng sáng landmark dời ra
  điểm đường gần nhất (tâm chợ An Đông nằm gọn trong nhà cao 5,4 nên
  vòng cũ bị nhà che mất). Sửa tiếp sau kiểm tra lần 3 (vòng đã thấy,
  popup vẫn hiện): cây/đèn vẫn thưa vì luật cũ loại mọi điểm chồng nhà
  — mô phỏng chỉ đặt được 5 cây / 4 đèn cả bản đồ do nhà phố xây sát
  vỉa hè; luật mới chỉ loại điểm nằm sâu trong nhà hơn 0,3 đơn vị, lấy
  đều khắp bản đồ về mức trần, đèn thêm tay vươn ra đường để nhận ra.
  Sửa tiếp sau kiểm tra lần 4 (vẫn chỉ 1 cây, chưa thấy đèn): luật
  "sâu trong nhà" vẫn loại gần hết vì điểm ven đường nằm trong nhà
  tới 0,9 đơn vị, không phải 0,3 — mô phỏng luật tìm điểm trống nhiều
  mức lệch cho 62 cây / 8 đèn đường, cộng 16 đèn quảng trường chợ
  (vòng 10/13 quanh chợ, tay hướng vào chợ), tổng 24 đèn; đồng thời
  tách các lớp mặt đất (vỉa hè 0,10, vạch 0,12, quảng trường 0,08, vòng
  0,20) để hết loang lổ do z-fighting giữa các lớp cách nhau 0,005.
  Kiểm tra visual cuối cùng vẫn là điện thoại của Boss.

## Nâng cấp UI/UX v1.2 (2026-11-04) — 4 trạng thái, design system, micro-interactions

- Design system tập trung ở `public/css/style.css` (`:root`): màu, spacing,
  bo góc, bóng, cỡ chữ dùng chung toàn game, không còn giá trị rải rác.
  Nút chính đậm hơn để chữ trắng đủ tương phản, chữ mờ đậm hơn
  (#6b5a44) cho dễ đọc. Mọi nút có hover (nhấc nhẹ + bóng), active
  (lún xuống), disabled (mờ, không bấm được, con trỏ cấm), focus-visible
  (viền cam) và trạng thái busy (spinner xoay sau chữ).
- 4 trạng thái cho mọi luồng dữ liệu:
  - Tải bản đồ: Loading = khung skeleton shimmer + chữ trạng thái,
    form bị khóa; Success = chữ xanh + form mở; Error = nguyên nhân rõ
    + nút Thử lại (tải lại bản đồ, hoặc tải lại trang nếu lỗi Three.js).
  - Vào thành phố: Loading = nút Vào khóa + spinner + form khóa;
    Error = hộp đỏ inline kèm nguyên nhân, nút mở lại để thử lại.
  - Hoạt động (feed): Loading = 3 dòng skeleton; Empty = khung nét đứt
    + nút "👋 Chào mọi người"; Data = mỗi dòng có giờ + nội dung, phân
    cấp rõ; Error = hộp đỏ + nút Thử lại gọi poll ngay.
  - Người chơi: khi chỉ có một mình, stats hiện gợi ý mờ + nút
    "Sao chép link mời" (trạng thái Empty của tính năng nhiều người).
  - Nhà ở: hàng trạng thái ở đầu thanh hành động — Empty = hướng dẫn
    "đi lại gần nhà", Data = tên đậm + giá cam + số tiền đang có
    (hoặc "nhà của bạn" / "đã có chủ"), Error = nguyên nhân + nút
    Thử lại, lỗi được giữ nguyên qua các tick poll cho tới khi thử lại
    thành công hoặc đổi nhà.
  - Mất kết nối: banner lỗi bền vững (không tự ẩn như toast) + nút
    "Thử lại ngay" gọi poll ngay, dữ liệu cũ vẫn hiển thị kèm cảnh báo.
- Chống bấm đúp: mọi nút hành động, đổi buổi, mua/bán/đặt nhà chính
  đều khóa + spinner trong lúc request đang chạy (server vẫn chặn thêm
  bằng cooldown 1 giây). Nút Vào đã khóa từ v1.1, nay khóa thêm cả form.
- Responsive: feed trên mobile không còn ẩn hẳn — thành panel có nút
  thu gọn/mở rộng, nằm trên minimap; thêm breakpoint 900px; nút hành
  động và màu áo đủ 44px cho ngón tay; thẻ vào thành phố co padding
  trên màn hẹp.
- Không đổi luật chơi, không đổi API: chỉ HTML/CSS/app.js + version
  (1.2.0). Kiểm tra visual cuối cùng vẫn là điện thoại của Boss.

## Refactor v1.1 (2026-11-04) — kiến trúc, logic nghiệp vụ, xử lý lỗi

Không đổi luật chơi, chỉ tách code và siết lỗi. Mọi hàm đều triển khai đủ,
không có TODO hay dữ liệu giả trong phần đã sửa.

- Nguồn sự thật duy nhất: `public/js/shared-core.js` dùng chung cho server
  (Node) và client (trình duyệt) — công thức giá nhà, bề rộng đường, giới
  hạn, hình học, và mọi quy tắc validate. Sửa một nơi là cả hai bên cùng đổi.
- Server tách thành module một trách nhiệm: `src/errors.js` (lỗi có mã và
  HTTP status), `src/config.js`, `src/validate.js`, `src/mapStore.js`
  (đọc bản đồ theo mtime, validate schema, giữ bản cũ nếu file mới hỏng),
  `src/economyStore.js` (ghi atomic tmp+fsync+rename, xoay backup .bak/.bak.1,
  snapshot/rollback khi lưu thất bại), `src/rooms.js` (Map, dọn phòng rỗng
  quá 1 giờ), `src/rateLimit.js`, `src/httpUtil.js`, `src/handlers.js`,
  `src/static.js` (allowlist file tĩnh, chống thoát khỏi public/).
  `server.js` chỉ còn khởi động, định tuyến và bắt lỗi toàn cục.
- Client tách thành: `public/css/style.css`, `public/js/shared-core.js`,
  `public/js/render.js` (Three.js, sprite, đổi buổi, dispose GPU),
  `public/js/map.js` (lưới, va chạm, vẽ thế giới, minimap tĩnh),
  `public/js/net.js` (API có timeout, lỗi có mã), `public/js/app.js`
  (phiên chơi, UI, vòng lặp game). `public/index.html` chỉ còn khung HTML
  và các thẻ script theo đúng thứ tự.
- Validate hai phía, lỗi tường minh: tên người chơi chặn ký tự HTML
  (`< > & " ' \``) và ký tự điều khiển, mã phòng, màu, deviceId
  (`__proto__`, `constructor`, `prototype` bị chặn), mã nhà, loại hành động,
  giá trị buổi, tư thế (chỉ `dung`, `chao`, `chup`), tọa độ phải là số hữu hạn.
  DeviceId gửi sai định dạng thì server trả 400, không âm thầm cấp ví mới
  (chỉ khi không gửi deviceId thì server mới cấp mới, để tương thích client cũ).
  Buổi sai giá trị thì trả 400 và không đẩy event, thay vì đẩy event rồi giữ
  buổi cũ như trước. Check-in sai landmark thì trả 400 và không cộng tiền,
  thay vì cộng tiền với địa điểm chung chung như trước.
- Kinh tế giao dịch an toàn: mua/bán/check-in/đặt nhà chính đều snapshot
  trước, lưu đĩa xong mới trả success; lưu thất bại thì rollback trong bộ nhớ
  và trả 500 với lý do rõ ràng. File economy hỏng thì thử backup trước, nếu
  backup cũng hỏng thì server fail nhanh ở lúc khởi động (giữ file hỏng lại
  để khôi phục thủ công), không âm thầm bắt đầu từ sổ trống và làm mất tiền.
  Dọn nhà mồ côi chỉ chạy khi mtime bản đồ đổi, không chạy mỗi lần poll state.
- Chống spam và chống farm: mỗi người chơi tối đa 60 hành động/phút và tối
  thiểu 1 giây giữa hai hành động (trả 429 với thời gian chờ), join tối đa
  10 lần/phút/IP. Feed client escape HTML nên tên người chơi không thể XSS
  dù server có lọt. Nút Vào khóa trong lúc request để không tạo hai session
  khi bấm đúp.
- Xử lý lỗi phía client: API có timeout (POST 10 giây, state 8 giây, bản đồ
  15 giây), lỗi mạng/timeout hiện toast một lần rồi tự thử lại ở tick sau,
  không còn `.catch` rỗng làm game đóng băng. Session hết hạn (server prune
  sau 25 giây không heartbeat) thì hiện lại màn hình vào với lý do rõ ràng.
  Tải bản đồ fail thì hiện nút Thử lại (tải lại bản đồ, hoặc tải lại trang
  nếu lỗi là Three.js CDN). Lỗi mua/bán/đặt nhà và hành động hiện toast thay
  cho alert; riêng xác nhận Bán nhà vẫn giữ confirm để tránh bấm nhầm.
  Xóa người chơi và nhãn nhà thì dispose geometry/material/texture để không
  rò rỉ GPU theo thời gian.
- Giới hạn còn lại (chưa làm ở v1.1, ghi rõ để không hiểu nhầm là đã xong):
  vẫn chưa có tài khoản/mật khẩu thật (ví theo thiết bị), chưa có WebSocket
  (vẫn poll 400ms), chưa có cache ETag cho bản đồ (đọc đĩa mỗi request để
  đảm bảo code mới sau deploy), va chạm kênh vẫn quét tuyến tính, và nội
  thất nhà / giao dịch người với người vẫn chưa có (vào ở hiện tại là spawn
  ngoài nhà chính).

## Cách chơi

- Mặc định vào thành phố chung `QUAN5`. Nhập mã phòng khác để chơi phòng riêng.
- Di chuyển: phím WASD / mũi tên, hoặc joystick trên điện thoại. Kéo để xoay camera.
- Hành động có sẵn (không có chat tự do): chào, ăn hủ tiếu, cà phê vợt,
  mua lồng đèn, mua sắm, chụp ảnh, check-in địa điểm gần nhất (+10 điểm),
  đổi buổi sáng / hoàng hôn / đêm.
- Bản đồ nhỏ (minimap) ở góc phải cho thấy ranh, đường, kênh, landmark và vị trí người chơi.

## Chạy local / trên VPS (không cần npm, chỉ dùng module có sẵn của Node)

```bash
node server.js   # mặc định PORT=3102, chỉ bind 127.0.0.1
npm run check    # kiểm tra cú pháp mọi file JS và build_map.py
npm test         # 21 unit test: shared-core, economy, rate limit, map
node scripts/smoke.js  # smoke test tích hợp: chạy server thật trong thư mục
                       # tạm rồi gọi API thật (join, mua, bán, validate, lỗi)
```

Phòng / người chơi chỉ giữ trong RAM, người chơi idle bị gỡ sau ~25 giây.
Tiền và nhà lưu bền trong `economy.json` (xem phần kinh tế nhà ở).
Đổi `server.js` thì phải restart service (phòng/người chơi trong RAM sẽ mất,
tiền/nhà thì không). Đổi `public/` hoặc `quan5-map.json` thì không cần restart
vì server đọc lại theo mtime.

## Triển khai nginx (tham khảo)

- Systemd: xem `quan5-online.service` (port 3102, `Restart=always`).
- Nginx: xem `quan5-snippet.txt` — thêm `location /quan5/` proxy về
  `http://127.0.0.1:3102/`, trang gốc của site không bị thay đổi.
- Khi deploy, sao lưu `economy.json` trên VPS trước, không bao giờ ghi đè
  nó bằng file local (local không có file này, và nó chứa tiền/nhà thật
  của người chơi).

## Cấu trúc

- `server.js` — entry point mỏng: khởi động, định tuyến, bắt lỗi toàn cục.
- `src/` — errors, config, validate, mapStore, economyStore, rooms,
  rateLimit, httpUtil, handlers, static (xem phần refactor v1.1).
- `public/js/shared-core.js` — công thức và validate dùng chung server/client.
- `public/js/render.js`, `public/js/map.js`, `public/js/net.js`,
  `public/js/app.js` — client theo từng trách nhiệm.
- `public/css/style.css` — toàn bộ giao diện.
- `public/index.html` — khung HTML và thứ tự script.
- `public/quan5-map.json` — bản đồ đã chuyển từ OSM sang tọa độ game
  (được tạo bởi `build_map.py` từ dữ liệu thô trong `osm/`).
- `build_map.py` — script chuyển OSM → `quan5-map.json` (lọc theo ranh Quận 5).
- `test/`, `scripts/smoke.js` — unit test và smoke test tích hợp.
- `quan5-online.service` — file systemd.
- `quan5-snippet.txt` — đoạn cấu hình nginx.
