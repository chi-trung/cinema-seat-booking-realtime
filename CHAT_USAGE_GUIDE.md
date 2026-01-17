# 🎬 Cinema Realtime Booking System - Chat Feature

## 🎯 Mục Đích

Dự án này là một hệ thống đặt vé xem phim real-time với tính năng chat hỗ trợ khách hàng, được xây dựng với các khái niệm lập trình mạng cơ bản.

---

## 🚀 Quick Start

### 1. Cài đặt Dependencies
```bash
npm install
```

### 2. Khởi động Server
```bash
npm start
```

Server sẽ chạy tại: `http://localhost:3000`

### 3. Truy cập Ứng dụng
Mở browser: `http://localhost:3000`

### 4. Tài Khoản Test
```
👨‍💼 Admin:  admin / admin123
👤 User:   user1 / user123
```

---

## 📨 Hướng Dẫn Sử Dụng Chat

### Cho Người Dùng (User)

#### Bước 1: Đăng Nhập
1. Truy cập: http://localhost:3000
2. Chọn tab "Đăng nhập"
3. Nhập:
   - Username: `user1`
   - Password: `user123`
4. Nhấp "Đăng nhập"

#### Bước 2: Mở Chat
1. Tìm biểu tượng **💬** ở góc dưới bên phải màn hình
2. Nhấp vào biểu tượng để mở cửa sổ chat

#### Bước 3: Gửi Tin Nhắn
1. Gõ tin nhắn vào input field
2. Nhấn **Enter** hoặc click nút **Gửi**
3. Tin nhắn sẽ xuất hiện ngay lập tức

#### Bước 4: Nhận Tin Nhắn từ Admin
- Khi admin gửi tin nhắn, nó sẽ xuất hiện tự động
- Tin nhắn của admin có background màu xám

---

### Cho Admin

#### Bước 1: Đăng Nhập
1. Truy cập: http://localhost:3000
2. Chọn tab "Đăng nhập"
3. Nhập:
   - Username: `admin`
   - Password: `admin123`
4. Nhấp "Đăng nhập"

#### Bước 2: Truy cập Chat Management
1. Kéo xuống trang
2. Tìm mục: **"💬 Quản lý tin nhắn hỗ trợ khách hàng"**
3. Sẽ thấy 2 panel:
   - **Bên trái:** Danh sách cuộc trò chuyện
   - **Bên phải:** Chi tiết conversation

#### Bước 3: Làm Mới Danh Sách
1. Nhấp nút **"Làm mới danh sách"** (màu xanh)
2. Danh sách sẽ update, hiển thị:
   - Tên người dùng
   - Preview tin nhắn cuối cùng
   - Thời gian tin nhắn cuối

#### Bước 4: Mở Conversation
1. Nhấp vào một user trong danh sách
2. Lịch sử chat sẽ xuất hiện bên phải
3. Tin nhắn sẽ tải từ database

#### Bước 5: Gửi Tin Nhắn
1. Gõ tin nhắn vào input field bên phải
2. Nhấn nút **"Gửi"** (màu xanh lá)
3. Tin nhắn sẽ gửi tới user
4. User sẽ nhận tin nhắn tức thì (real-time)

---

## 🔄 Luồng Hoạt Động Chat

### Scenario 1: User Khởi Tạo Cuộc Trò Chuyện

```
1. User login
   ↓
2. User mở chat
   ├─ emit: 'join-chat' → Server
   │
   ← Server: 'chat-history' (lịch sử)
   │
3. User gửi tin nhắn
   ├─ emit: 'send-message' → Server
   │
   ← Server: 'new-message' (confirm)
   │ 
   ← Admin: 'new-message' (nếu đang online)
```

### Scenario 2: Admin Trả Lời User

```
1. Admin login
   ↓
2. Admin lấy danh sách
   ├─ emit: 'admin-get-conversations' → Server
   │
   ← Server: 'conversation-list'
   │
3. Admin mở conversation
   ├─ emit: 'admin-open-conversation' → Server
   │
   ← Server: 'chat-history'
   │
4. Admin gửi tin nhắn
   ├─ emit: 'send-message' → Server
   │
   ← Server: 'new-message'
   │
   ← User: 'new-message' (real-time)
```

---

## 🛠️ Kiến Thức Lập Trình Mạng

### 1. **WebSocket (Socket.IO)**
- **Khái niệm:** Protocol hai chiều, kết nối liên tục
- **Ưu điểm:** Low latency, real-time, giảm overhead
- **Ứng dụng:** Gửi/nhận tin nhắn tức thì

### 2. **HTTP REST API**
- Login/Register
- Movie management
- Seat booking

### 3. **Database Persistence**
- SQLite lưu tin nhắn
- Recovery khi reconnect

### 4. **Authentication & Authorization**
- JWT tokens
- Role-based access (User/Admin)
- User isolation

### 5. **Connection Management**
- Tracking active users
- Socket cleanup on disconnect
- Reconnection handling

---

## 📊 Database Schema - Chat

### Bảng: chat_messages
```sql
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);
```

### Indexes
```sql
CREATE INDEX idx_chat_users ON chat_messages(sender_id, receiver_id);
CREATE INDEX idx_chat_created ON chat_messages(created_at);
```

---

## 🎨 Frontend Components

### Chat Widget (User)

```
┌─────────────────┐
│  💬             │  ← Chat Bubble (click để mở)
└─────────────────┘

Mở rộng:
┌──────────────────────────┐
│ Hỗ trợ khách hàng    [×] │  ← Header
├──────────────────────────┤
│ [admin]: Xin chào ☺      │  ← Messages
│ [user]:  Tôi có vấn đề   │
│                          │
│ [..........................] ← Input
│ [Gửi]                    │  ← Send Button
└──────────────────────────┘
```

### Admin Chat Dashboard

```
┌─────────────────────────────────────────────────┐
│ 💬 Quản lý tin nhắn hỗ trợ khách hàng            │
├─────────────────────┬──────────────────────────┤
│ Danh sách TH        │ Chi tiết conversation   │
│                     │                         │
│ user1               │ [admin]: Xin chào       │
│ > "Tôi có..."       │ [user]: Em ơi...        │
│ 10:30 AM            │                         │
│                     │ [user1]: Cảm ơn         │
│ user2               │                         │
│ > "Giúp tôi..."     │ [........................] 
│ 09:15 AM            │ [Gửi]                   │
│                     │                         │
│ [Làm mới]           │                         │
└─────────────────────┴──────────────────────────┘
```

---

## 🐛 Troubleshooting

### Problem 1: Chat không kết nối
**Giải pháp:**
- Kiểm tra server có chạy: `http://localhost:3000`
- Check browser console (F12) xem có lỗi gì
- Refresh trang

### Problem 2: Tin nhắn không gửi được
**Giải pháp:**
- Kiểm tra kết nối Socket (xem status indicator)
- Input field có trống không?
- Logout rồi login lại

### Problem 3: Admin không thấy user
**Giải pháp:**
- User phải login trước
- Click "Làm mới danh sách"
- Kiểm tra database: `cinema.db`

### Problem 4: Lỗi "Mất kết nối tới server"
**Giải pháp:**
```bash
# Khởi động lại server
npm start

# Hoặc kiểm tra port 3000
netstat -ano | findstr :3000
```

---

## 📈 Các Socket.IO Events

### Client → Server
```javascript
'join-chat'              // User tham gia chat
'send-message'           // Gửi tin nhắn
'admin-get-conversations' // Admin lấy danh sách
'admin-open-conversation' // Admin mở chat với user
'ping'                   // Keep-alive
```

### Server → Client
```javascript
'chat-history'           // Lịch sử chat
'new-message'            // Tin nhắn mới
'conversation-list'      // Danh sách conversation
'admin-joined'           // Thông báo admin tham gia
'seats-updated'          // (Existing) Ghế được update
```

---

## 🔐 Security Features

### 1. Authentication
- Login dengan username/password
- Password hashed với bcrypt
- JWT token for session

### 2. Authorization
- User chỉ thấy conversation của mình
- Admin quyền truy cập tất cả
- Role-based access control

### 3. Data Validation
- Parameterized SQL queries (SQL injection prevention)
- XSS prevention (HTML escaping)
- Input validation

### 4. Connection Security
- Socket.IO namespace isolation
- User tracking per connection
- Auto-cleanup on disconnect

---

## 📝 File Structure

```
cinema-seat-booking-realtime/
├── server/
│   ├── server.js          (🆕 Socket.IO handlers)
│   ├── database.js        (🆕 Chat functions)
│   └── cinema.db
├── client/
│   ├── app.js             (🆕 Chat logic)
│   ├── index.html         (🆕 Chat UI)
│   ├── styles.css         (🆕 Chat styles)
│   └── ...
├── uploads/
├── package.json
├── CHAT_FEATURE.md        (📄 Documentation)
└── README.md              (📄 This file)
```

---

## 🧪 Test Cases

### Test 1: Basic Message Exchange
```
1. Login user1
2. Open chat
3. Send: "Xin chào"
4. Login admin (second tab)
5. Admin sends: "Xin chào bạn"
6. ✅ Both see messages real-time
```

### Test 2: Chat History Persistence
```
1. user1 sends "Hello"
2. user1 logout
3. user1 login
4. ✅ "Hello" message still there
```

### Test 3: Multiple Users
```
1. user1 sends message
2. Create user2 account
3. user2 sends message
4. Admin checks
5. ✅ Both conversations show in list
```

### Test 4: Admin Management
```
1. 3 users send messages
2. Admin refresh
3. ✅ See 3 conversations
4. Admin sends reply to user2
5. ✅ user2 receives immediately
```

---

## 📚 References

### WebSocket Concepts
- https://tools.ietf.org/html/rfc6455
- Socket.IO: https://socket.io/

### Network Programming
- HTTP/1.1: RFC 7230-7237
- REST API: https://restfulapi.net/
- JWT: https://jwt.io/

### Database
- SQLite: https://www.sqlite.org/

---

## 💡 Possible Improvements

1. **Typing Indicator** - Show "Admin is typing..."
2. **Message Search** - Find messages by keyword
3. **File Sharing** - Send images/files
4. **Notification Sound** - Play sound on new message
5. **Chat Archive** - Export conversation history
6. **User Presence** - Online/offline status
7. **Read Receipts** - Show message delivery status
8. **Rate Limiting** - Prevent spam

---

## 🤝 Support

Nếu có vấn đề hoặc câu hỏi, vui lòng:
1. Check console log (F12)
2. Restart server
3. Clear browser cache
4. Check database connection

---

**Happy Coding! 🚀**
