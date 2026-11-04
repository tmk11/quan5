# Thiết kế lại Quận 5 Online v2 — Cân bằng & Thu hút

> Trạng thái triển khai: **P1 ĐANG TRIỂN KHAI** (code xong, đang chạy test rồi mới deploy) — check-in ngày, trần shipper, giá hành động, takeover 100% + niêm phong 24h. **P2, P3 CHƯA làm** (làm lần lượt sau P1).
> Căn cứ: code live v1.8.0 + economy thật (4 ví / 1 nhà: TestSoHong + Thế Thắng 93.000đ).
> Nguyên tắc bất di bất dịch: **không xóa ví, không xóa nhà, không đụng tiền ai đang có.**

## 0. Chẩn đoán: game hiện tại lệch ở đâu

### Vòi tiền và hố tiền hiện tại (số thật từ code)

| Nguồn | Thu nhập | Giới hạn hiện tại |
|---|---|---|
| Check-in landmark | +5.000đ + 10 điểm, mọi lần | **KHÔNG có** (ngoài cooldown 1 giây chung + 60 hành động/phút). Đứng một chỗ bấm: tối đa lý thuyết 300.000đ/phút |
| Shipper | 8.000–15.000đ/đơn, ~60 giây/đơn | Không giới hạn số đơn/ngày |
| Lân (10 phút/lần/phòng) | Lì xì 3.000–10.000đ, tồn tại 20 giây | Đã có gate tốt (theo thời gian + vị trí ngẫu nhiên) — giữ nguyên |
| Quán (khách ghé bấm Ăn/Cà phê/Mua sắm) | Chủ +2.000đ/lượt | Có chống farm: 60 giây/khách/nhà — tốt, giữ nguyên |
| Bán nhà | Hoàn 80% giá đã trả | Đốt 20% — hố tiền tốt |
| Mua lại (takeover) | Người mua trả 125%, chủ cũ nhận 115% | Đốt ~10% — nhưng chủ cũ **lãi 15%** (xem lỗi số 4) |
| Mua nhà chưa có chủ | Tiền biến mất khỏi ví | Hố tiền tốt |

Hố tiền trong chơi hàng ngày: **không có**. Ăn, uống, mua sắm, chụp ảnh đều miễn phí.
Tiền chỉ vào không ra → càng chơi lâu càng giàu vô hạn → nhà đắt nhất (1.000.000đ) cũng chỉ là vấn đề thời gian ngắn.

### 9 vấn đề, theo mức nghiêm trọng

1. **Vòi check-in không khóa (nghiêm trọng nhất).** Tiền vô hạn, phá mọi giá nhà và mọi bảng xếp hạng về tiền.
2. **Điểm ⭐ chết.** Điểm chỉ sống trong RAM phiên chơi, restart là mất, và không dùng vào việc gì. Người chơi không có lý do quan tâm điểm.
3. **Tiền không có chỗ tiêu hàng ngày.** Không có chi phí sinh hoạt trong game → không có quyết định chi tiêu nào.
4. **Takeover ngược đời.** Bị lấy nhà lại **lãi 15%** → chiến thuật tối ưu là "mua nhà rẻ rồi chờ bị lấy". Nhà không có cảm giác an toàn, không có lý do giữ nhà.
5. **4 loại quán chỉ khác tên.** Buff khách giống hệt nhau (+15% tốc độ) → chọn quán nào cũng như nhau, không có chiến thuật chọn vị trí/loại quán.
6. **Không có mục tiêu ngày/tuần.** Vào game 10 phút là hết việc: check-in, shipper, lân — rồi không còn gì để hướng tới.
7. **Không có lý do ghé nhà bạn.** Visit chỉ có toast chào, khách không được gì, chủ không được gì (trừ khi khách bấm Ăn/Cà phê/Mua sắm đúng quán đó).
8. **Người mới không biết phải làm gì đầu tiên.** Spawn xong là tự bơi, không có chuỗi hướng dẫn, không có mốc đầu tiên để phấn đấu.
9. **Bảng xếp hạng chỉ có một trục (tiền).** Người giàu nhất mãi đứng đầu, người mới không bao giờ có cửa — mất động lực đua.

## 1. Triết lý thiết kế (3 trụ, mọi tính năng mới phải phục vụ ít nhất 1 trụ)

1. **Mỗi ngày 10 phút đều tiến bộ.** Người bận vẫn có phần thưởng ngày rõ ràng, không bắt cày.
2. **Tiền kiếm được phải có chỗ tiêu đáng giá.** Hố tiền là đồ đẹp, trải nghiệm, sự kiện — không phải thuế phạt người chơi.
3. **Nhà là nhà, không phải cổ phiếu.** Chủ nhà được tôn trọng: bị lấy không lỗ, nhưng cũng không lãi; nhà vừa đổi chủ được bảo vệ khỏi cướp dây chuyền.

## 2. Giai đoạn 1 — Cân bằng tiền (chỉ đổi số và vài luật, không thêm hệ thống lớn)

### 2.1. Khóa vòi check-in (sửa lỗi số 1)

- Mỗi landmark chỉ thưởng **tiền 1 lần/ngày/người** (lưu bền theo ngày, reset lúc 0h giờ Berlin).
- Các lần check-in sau trong ngày tại cùng landmark: vẫn +điểm, không +tiền.
- Toán mới: 11 landmark × 5.000đ = **tối đa 55.000đ/ngày** từ check-in — vẫn hào phóng, nhưng hết đường farm vô hạn.

### 2.2. Shipper có trần ngày (giữ cảm giác làm giàu, chặn cày vô hạn)

- 5 đơn/ngày thưởng đầy đủ (8.000–15.000đ/đơn).
- Từ đơn thứ 6: chỉ +điểm, không +tiền.
- Toán mới: tối đa ~60.000đ/ngày từ shipper.

### 2.3. Hành động ăn/uống/mua sắm có giá (sửa lỗi số 3, tạo hố tiền hàng ngày)

- Hủ tiếu 3.000đ, cà phê vợt 2.000đ, mua lồng đèn 5.000đ, mua sắm 4.000đ.
- Chào và chụp ảnh **vẫn miễn phí** (giữ niềm vui casual, giữ tương tác xã hội không rào cản).
- Ăn/uống/mua sắm **tại quán của người khác**: trong số tiền khách trả, chủ quán nhận 2.000đ (như hiện tại), phần còn lại đốt (hố tiền). Tiền không còn tự sinh ra từ hư không nữa mà **chạy từ khách sang chủ** — nền kinh tế người chơi thật.
- Ăn/uống/mua sắm ngoài đường (không gần quán nào): toàn bộ tiền đốt (trả cho "sạp chợ").
- Người mới bắt đầu với 100.000đ nên giá này không gây khó khăn gì.

### 2.4. Takeover công bằng + niêm phong (sửa lỗi số 4)

- Người mua vẫn trả 125% giá hiện tại (giữ).
- Chủ cũ nhận lại **100% số tiền mình đã trả** (thay vì 115%): không lỗ, không lãi — hết chiến thuật "mua để bị lấy".
- Phần chênh lệch 25% đốt toàn bộ (hố tiền mạnh hơn, tốt cho chống lạm phát).
- Nhà vừa bị mua lại được **niêm phong 24 giờ**: trong 24 giờ đó không ai mua lại được nữa. Chống cướp dây chuyền, chủ mới yên tâm dọn vào ở.
- Không niêm phong sau mua/bán thường (giao dịch tự nguyện vẫn linh hoạt).

### 2.5. Đường cong thu nhập mới (kiểm chứng bằng số)

| Kiểu chơi | Thu/ngày (tối đa) | Trừ ăn uống | Ròng/ngày | Tới mốc |
|---|---|---|---|---|
| Casual (30 phút) | ~3 landmark (15.000) + 1 shipper (12.000) + nhiệm vụ (5.000) ≈ 32.000 | ~5.000 | ~27.000 | Nhà đầu tiên 42.000đ sau ~2 ngày |
| Tích cực (2 giờ) | 11 landmark (55.000) + 5 shipper (60.000) + nhiệm vụ (15.000) + lân (~20.000) ≈ 150.000 | ~15.000 | ~135.000 | Nhà 200.000đ sau ~2 ngày, nhà 1.000.000đ sau ~8 ngày |

Nhà vẫn mua được nhanh ở giai đoạn đầu (quan trọng cho giữ chân), nhưng nhà đắt thành mục tiêu dài hơi thật sự. Khi đông người chơi, 1.022 nhà sẽ tự khan hiếm và cân bằng tiếp — tiền không còn là rào cản duy nhất.

## 3. Giai đoạn 2 — Tiến bộ, quán có bản sắc, lý do quay lại

### 3.1. Điểm sống lại: lưu bền + cấp bậc danh hiệu (sửa lỗi số 2)

- Điểm chuyển từ RAM phiên chơi sang **lưu bền trong economy.json** (cùng chỗ với tiền/nhà).
  - Lưu ý migration trung thực: điểm cũ trước giờ chỉ sống trong RAM nên khi deploy, điểm mọi người bắt đầu lại từ 0 — chấp nhận được vì điểm cũ chưa từng dùng vào việc gì; **tiền và nhà không đụng tới**.
- Cấp bậc theo tổng điểm (chỉ là danh hiệu hiển thị cạnh tên, trên bảng, trên Sổ Hồng — **không tăng sức mạnh**, không pay-to-win):
  - 0: Dân mới · 100: Hàng xóm thân quen · 300: Tiểu thương · 700: Chủ sạp · 1.500: Địa chủ nhỏ · 3.000: Địa chủ Chợ Lớn · 6.000: Ông/Bà chủ Chợ Lớn.
- Điểm kiếm từ: check-in (+10 lần đầu/ngày/landmark, +2 các lần sau), hoàn thành shipper (+20), nhặt lì xì (+15), ghé nhà bạn (+10, xem §4), nhiệm vụ ngày (+30–50).

### 3.2. Nhiệm vụ ngày (sửa lỗi số 6)

- Mỗi ngày 3 nhiệm vụ, xoay ngẫu nhiên từ pool ~12 nhiệm vụ, reset 0h giờ Berlin.
- Ví dụ pool: check-in 2 landmark khác nhau · giao 2 đơn shipper · ghé 1 nhà bạn và bấm chào · ăn ở 1 quán của người khác · nhặt 1 lì xì · chụp ảnh ở Phố lồng đèn · ghé thăm 1 nhà đang rao bán · mua sắm ở Chợ Bình Tây.
- Thưởng: mỗi nhiệm vụ +30 điểm + 5.000đ; hoàn thành cả 3 thêm +50 điểm + 10.000đ (tối đa ~25.000đ/ngày từ nhiệm vụ — nằm trong đường cong §2.5).

### 3.3. Sưu tầm "Tem Chợ Lớn" (mục tiêu dài hơi, không tốn tiền)

- Check-in đủ 11 landmark (mỗi cái 1 lần, không giới hạn ngày) → đủ bộ tem.
- Thưởng: danh hiệu "Người thuộc Chợ Lớn" + 1 áo đặc biệt miễn phí (cosmetic, không bán).
- Giao diện: danh sách tem đơn giản trong panel (đã có landmark nào, thiếu landmark nào).

### 3.4. Bảng xếp hạng 3 trục (sửa lỗi số 9)

- Top Địa chủ (tiền + giá nhà — như hiện tại, không reset).
- Top Năng động (điểm **tuần**, reset thứ 2 hàng tuần — người mới luôn có cửa).
- Top Shipper (số đơn tuần, reset thứ 2).
- Top 3 tuần nhận danh hiệu tuần + áo tuần (cosmetic, hết tuần thu hồi áo tuần nhưng giữ danh hiệu trong hồ sơ).

### 3.5. Quán có bản sắc (sửa lỗi số 5)

- Thu nhập chủ quán **giữ 2.000đ cho mọi loại** (công bằng — không ép chọn loại "meta").
- Khác biệt nằm ở buff cho KHÁCH (lý do khách chọn quán, lý do chủ chọn vị trí):
  - 🦆 Tiệm Vịt Quay: khách +25% tốc độ 30 giây (nhanh nhất — món chính, nhiều năng lượng).
  - 🥣 Quán Chè: khách +15% tốc độ 60 giây (lâu nhất — ngồi lâu, thong thả).
  - 🪙 Tiệm Vàng: khách +15% tốc độ 30 giây + đơn shipper kế tiếp +10% thưởng (quán của dân làm ăn).
  - 🌿 Tiệm Thuốc Bắc: khách +15% tốc độ 30 giây + lần check-in kế tiếp +2.000đ (quán của dân sành Chợ Lớn).
- Đổi biển vẫn miễn phí, không giới hạn (cho chủ thử nghiệm chiến thuật theo vị trí quán: gần tuyến shipper thì Vàng, gần landmark thì Thuốc Bắc...).

## 4. Giai đoạn 3 — Xã hội và sự kiện

### 4.1. Ghé nhà bạn có thưởng (sửa lỗi số 7, làm NPC có ý nghĩa thật)

- Lần đầu/ngày ghé nhà người khác + bấm chào: khách +10 điểm + 1.000đ "lì xì hàng xóm".
- Chủ nhà nhận +500đ "tiếp khách" mỗi lượt khách đầu tiên trong ngày, tối đa 10 lượt/ngày (5.000đ) — chống farm, khuyến khích làm chủ nhà hiếu khách.
- **Áp dụng cả khi chủ offline (NPC đứng hiên):** khách chào NPC vẫn nhận thưởng, chủ vẫn tích lũy 500đ dù offline. Đây chính là lý do NPC tồn tại: thành phố vắng vẫn có người để ghé, chủ offline vẫn có thu nhập nhỏ.

### 4.2. Chợ phiên cuối tuần (sự kiện định kỳ, rẻ để làm)

- Thứ 7 + Chủ nhật: shipper thưởng ×1,5; check-in landmark khu chợ +2 điểm (không +tiền thêm, tránh phá đường cong); mỗi ngày 1 nhà ngẫu nhiên đang rao bán được giảm 20% ("nhà mở cửa hôm nay", xoay vòng, thông báo trên feed).
- Không cần nội dung mới — chỉ là hệ số nhân theo thứ trong tuần + 1 nhà giảm giá xoay vòng.

### 4.3. Lân vàng (điểm nhấn hiếm, rẻ để làm)

- 10% lần Lân xuất hiện là "Lân vàng": lì xì 15.000–25.000đ, thông báo feed đặc biệt.
- Tác động kinh tế thấp (hiếm), tác động cảm xúc cao (ai cũng muốn chạy theo khi nghe tin).

### 4.4. Đua Top tuần (vòng lặp giữ chân)

- Đã có ở §3.4 (Top Năng động + Top Shipper tuần). Thêm: thông báo thứ 2 khi reset + trao danh hiệu tuần ngay trong feed, để người thắng được cả phòng thấy.

## 5. Người mới (sửa lỗi số 8)

- Chuỗi tân thủ 4 bước, hiện 1 lần khi vào game lần đầu (đóng được, không bắt buộc):
  1. Bấm chào 1 người (miễn phí) → +10 điểm.
  2. Check-in Chợ An Đông (ngay gần điểm spawn) → +5.000đ.
  3. Ăn hủ tiếu (3.000đ) → hiểu tiền tiêu trong game.
  4. Mua nhà đầu tiên → nhận "tiền mừng tân gia" +10.000đ một lần (không giảm giá nhà — tránh méo giá thị trường).
- Panel "Bắt đầu ở đây" 3 dòng trong game (đóng được): chào → check-in → mua nhà.

## 6. Những gì KHÔNG làm (giữ bản sắc game)

- **Không chat tự do.** Giữ preset actions — tránh toxic, giữ cute, giữ đúng thiết kế gốc.
- **Không thuế/phí duy trì nhà hàng ngày.** Không phạt người bận, người offline.
- **Không tiền thật, không pay-to-win.** Mọi thứ mua bằng tiền/điểm trong game.
- **Không xóa nhà/ví ai.** Mọi thay đổi giá/luật chỉ áp dụng cho giao dịch mới; nhà đã mua giữ nguyên giá lúc mua.
- **Không làm khó người casual.** Mọi trần đều hào phóng (55.000 check-in, 5 đơn shipper) — trần chỉ chặn farm vô hạn, không chặn chơi vui.

## 7. Lộ trình triển khai (mỗi giai đoạn: code → test → deploy → check browser → Boss check điện thoại)

| Giai đoạn | Nội dung | Chủ yếu chạm vào | Ước lượng |
|---|---|---|---|
| P1 | §2: khóa vòi check-in, trần shipper, giá hành động, takeover 100% + niêm phong 24h | Server + hiển thị giá client | ~1 buổi |
| P2 | §3: điểm lưu bền, cấp bậc, nhiệm vụ ngày, tem Chợ Lớn, bảng tuần, buff theo loại quán | Server + client HUD/panel | ~1–2 buổi |
| P3 | §4: thưởng ghé nhà (kể cả NPC), chợ phiên cuối tuần, Lân vàng, đua top tuần | Server + feed | ~1 buổi |

Rủi ro và cách giảm:
- Người chơi cũ quen ăn miễn phí → giá thấp (2.000–5.000đ), chào/chụp vẫn free, tân gia +10.000đ bù lại cảm giác.
- Điểm lưu bền làm mất điểm RAM cũ → điểm cũ chưa dùng vào việc gì nên không ai thiệt thực chất; tiền/nhà nguyên vẹn.
- Buff theo loại quán có thể sinh "meta" → thu nhập chủ giữ bằng nhau (2.000đ) nên meta chỉ ảnh hưởng lưu lượng khách, không ảnh hưởng túi tiền chủ.

## 8. Câu hỏi cần Boss chốt (trước khi làm)

1. Thu phí ăn/uống/mua sắm (2.000–5.000đ) — Boss có đồng ý không, hay muốn giữ miễn phí hoàn toàn?
2. Takeover hoàn 100% + niêm phong 24h — Boss có đồng ý không?
3. Làm P1 trước rồi Boss chơi thử, hay duyệt toàn bộ rồi làm lần lượt P1→P2→P3?
