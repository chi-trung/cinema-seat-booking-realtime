# 🧹 Cơ chế Auto-Cleanup Ghế Hết Hạn

## 📋 Tổng quan

Hệ thống tự động giải phóng các ghế đã được chọn nhưng hết hạn (`reserved_until < thời gian hiện tại`) để tránh tình trạng "ghế zombie" - ghế bị chiếm giữ vĩnh viễn do user không hoàn tất đặt vé hoặc disconnect đột ngột.

---

## ⚙️ Cơ chế hoạt động

### 1. **Khi User Chọn Ghế**
```javascript
// File: server/database.js - updateSeatStatus()
reserved_until = hiện tại + 5 phút
```

- User chọn ghế → status = `"selected"`
- `reserved_until` được set = thời gian hiện tại + **5 phút**
- Ghế sẽ tự động "hết hạn" sau 5 phút nếu user không nhấn "Đặt vé"

### 2. **Auto-Cleanup Định Kỳ (Mỗi 1 phút)**
```javascript
// File: server/server.js
setInterval(async () => {
  await db.releaseExpiredReservations();
  console.log("🧹 Auto-cleanup: Đã kiểm tra và giải phóng ghế hết hạn");
}, 60000); // 60 seconds
```

**Khi nào chạy:**
- ⏰ Tự động mỗi **60 giây** (1 phút)
- 🚀 Chạy ngay khi server khởi động
- 🔄 Lặp lại liên tục cho đến khi server tắt

**Chức năng:**
- Quét toàn bộ database tìm ghế có `status = "selected"` và `reserved_until < CURRENT_TIMESTAMP`
- Tự động set về:
  - `status = "available"`
  - `user_id = NULL`
  - `reserved_until = NULL`

### 3. **Cleanup Khi User Join Movie**
```javascript
// File: server/server.js - join-movie event
socket.on("join-movie", async (data) => {
  // Cleanup ghế expired trước khi gửi
  await db.releaseExpiredReservations();
  
  // Gửi trạng thái ghế hiện tại
  db.getSeatsByMovie(movieId).then((seats) => {
    socket.emit("seats-updated", { movieId, seats });
  });
});
```

**Khi nào chạy:**
- 👤 Mỗi khi user vào trang chọn ghế
- 🔄 Trước khi gửi danh sách ghế cho client
- ⚡ Đảm bảo user luôn nhìn thấy trạng thái ghế **mới nhất**

---

## 🗄️ Database Query

```sql
-- File: server/database.js - releaseExpiredReservations()
UPDATE seats
SET status = 'available', 
    user_id = NULL, 
    reserved_until = NULL
WHERE status = 'selected' 
  AND reserved_until < CURRENT_TIMESTAMP
```

**Logic:**
- Chỉ giải phóng ghế có `status = "selected"` (không động ghế `"booked"`)
- So sánh `reserved_until` với thời gian SQLite hiện tại (`CURRENT_TIMESTAMP`)
- Xóa thông tin user và thời gian hết hạn

---

## 📊 Trạng thái Ghế

| Status | Ý nghĩa | Có thể bị cleanup? | Thời gian giữ |
|--------|---------|-------------------|---------------|
| `available` | Ghế trống | ❌ Không | - |
| `selected` | Đang chọn (tạm giữ) | ✅ **Có** (nếu hết hạn) | 5 phút |
| `booked` | Đã đặt vé (xác nhận) | ❌ Không | Vĩnh viễn |

---

## 🎯 Kịch bản thực tế

### Scenario 1: User chọn ghế nhưng không đặt
```
00:00 - User A chọn ghế F3
        → status = "selected", reserved_until = "00:05"
05:00 - Không nhấn "Đặt vé"
06:00 - Auto-cleanup chạy → F3 về "available" ✅
```

### Scenario 2: User đóng tab đột ngột
```
00:00 - User B chọn ghế G3, H1
        → status = "selected", reserved_until = "00:05"
00:02 - Đóng trình duyệt đột ngột (không disconnect)
06:00 - Auto-cleanup chạy → G3, H1 về "available" ✅
```

### Scenario 3: User hoàn tất đặt vé
```
00:00 - User C chọn ghế H2
        → status = "selected", reserved_until = "00:05"
00:03 - Nhấn "Đặt vé"
        → status = "booked", reserved_until = NULL
06:00 - Auto-cleanup chạy → H2 VẪN "booked" ✅ (không bị xóa)
```

### Scenario 4: Ghế "zombie" từ hôm trước
```
20/1/2026 - User D chọn ghế F3, G3, H1, H2 → disconnect đột ngột
22/1/2026 - Server restart với auto-cleanup
            → Sau 1 phút: 4 ghế về "available" ✅
```

---

## 🔧 Cấu hình

### Thay đổi thời gian giữ ghế (mặc định: 5 phút)
```javascript
// File: server/database.js - updateSeatStatus()
const reserved_until = new Date(Date.now() + 5 * 60000).toISOString();
//                                              ↑
//                                        Thay đổi số phút tại đây
```

### Thay đổi tần suất cleanup (mặc định: 60 giây)
```javascript
// File: server/server.js
setInterval(async () => {
  await db.releaseExpiredReservations();
}, 60000); // Thay đổi milliseconds tại đây (60000 = 1 phút)
```

---

## 📝 Console Logs

### Khi cleanup thành công
```
🧹 Auto-cleanup: Đã kiểm tra và giải phóng ghế hết hạn
```

### Khi cleanup lỗi
```
❌ Auto-cleanup error: [error message]
```

---

## ✅ Lợi ích

1. ✨ **Giải phóng tài nguyên tự động** - Không cần can thiệp thủ công
2. 🚫 **Ngăn chặn ghế zombie** - Ghế không bị chiếm vĩnh viễn
3. 🎯 **Trải nghiệm tốt hơn** - User khác có thể chọn ghế sau 5 phút
4. 📊 **Database sạch sẽ** - Không lưu trữ dữ liệu "rác"
5. ⚡ **Real-time chính xác** - Ghế luôn cập nhật trạng thái mới nhất

---

## 🔍 Testing

### Kiểm tra manual trong database
```bash
# Xem ghế đang selected
node -e "const sqlite3 = require('sqlite3').verbose(); const db = new sqlite3.Database('./server/cinema.db'); db.all('SELECT seat_id, status, user_id, reserved_until FROM seats WHERE status = \"selected\"', [], (err, rows) => { console.log(rows); db.close(); });"

# Xem ghế hết hạn
node -e "const sqlite3 = require('sqlite3').verbose(); const db = new sqlite3.Database('./server/cinema.db'); db.all('SELECT seat_id, status, reserved_until FROM seats WHERE status = \"selected\" AND reserved_until < datetime(\"now\")', [], (err, rows) => { console.log('Expired:', rows); db.close(); });"
```

### Test flow
1. Chọn 1 ghế → kiểm tra `reserved_until` trong DB
2. Đợi 5 phút
3. Kiểm tra lại → ghế vẫn `selected` (chưa cleanup)
4. Đợi thêm 1 phút (tổng 6 phút) → Auto-cleanup chạy
5. Refresh trang → Ghế về `available` ✅

---

## 🐛 Troubleshooting

### Ghế không tự động giải phóng?
**Kiểm tra:**
1. Server có đang chạy? (`npm start`)
2. Console có log `🧹 Auto-cleanup` mỗi phút không?
3. `reserved_until` có nhỏ hơn thời gian hiện tại không?

### Ghế bị giải phóng quá sớm?
**Nguyên nhân:** Thời gian server không đồng bộ
**Giải pháp:** Kiểm tra timezone server (hiện tại dùng UTC)

---

## 📚 Files liên quan

- `server/database.js` - Hàm `releaseExpiredReservations()`
- `server/server.js` - setInterval + join-movie event
- `AUTO_CLEANUP_MECHANISM.md` - Documentation này

---

**Ngày tạo:** 22/01/2026  
**Phiên bản:** 1.0  
**Tác giả:** Cinema Booking System
