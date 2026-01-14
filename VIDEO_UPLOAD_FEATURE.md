# 🎥 Chức Năng Upload Video Demo - Resumable Upload System

## Tổng Quan

Tính năng upload video demo cho phim với hỗ trợ **Resumable Upload** (tiếp tục upload sau khi ngắt kết nối). Đây là ứng dụng thực tế của các kiến thức lập trình mạng nâng cao.

## 🔑 Kiến Thức Lập Trình Mạng Được Áp Dụng

### 1. **Session Management (Quản lý Session)**

- **Khái niệm**: Lưu trạng thái upload trên server để có thể tiếp tục sau khi disconnect
- **Database**: Bảng `video_upload_sessions` lưu trữ:
  - `id`: Session ID duy nhất
  - `user_id`: ID người upload
  - `movie_id`: ID phim
  - `uploaded_size`: Dung lượng đã upload
  - `total_size`: Tổng dung lượng file
  - `status`: in_progress, completed

### 2. **Chunked Upload (Upload theo Chunks)**

- **Khái niệm**: Chia file lớn thành các phần nhỏ (chunks) để upload riêng lẻ
- **Lợi ích**:
  - Giảm bộ nhớ sử dụng (không load toàn bộ file vào RAM)
  - Có thể resume từ chunk bị gián đoạn
  - Tính toán speed và ETA chính xác hơn
- **Kích thước chunk mặc định**: 1MB

### 3. **Checksum Validation (Kiểm Tra Tính Toàn Vẹn)**

- **Khái niệm**: Tính MD5 hash của mỗi chunk để xác minh không bị lỗi trong quá trình truyền
- **Database**: Bảng `video_chunks` lưu:
  - `session_id`: ID session
  - `chunk_index`: Thứ tự chunk
  - `chunk_size`: Kích thước chunk
  - `checksum`: MD5 hash để xác minh

### 4. **Stateful Protocol (Giao Thức Có Trạng Thái)**

- **HTTP Headers tùy chỉnh**:
  - `X-Session-Id`: Xác định upload session
  - `X-Chunk-Index`: Số thứ tự chunk
  - `X-Chunk-Size`: Kích thước chunk
- Cho phép server biết được chính xác upload đang ở vị trí nào

### 5. **Streaming Data (Truyền Dữ Liệu Theo Luồng)**

- **Khái niệm**: Ghi file vào disk theo từng chunk thay vì load toàn bộ
- **Node.js**: Sử dụng `fs.createWriteStream()` để ghi file hiệu quả
- **Lợi ích**: Tiết kiệm RAM, khả năng xử lý file rất lớn

### 6. **Atomic Operations (Thao Tác Nguyên Tử)**

- **Quá trình hoàn thành**:
  1. Kiểm tra tất cả chunks đã upload
  2. Ghép các chunks thành file hoàn chỉnh
  3. Di chuyển file từ temp sang folder uploads
  4. Cập nhật database
  5. Broadcast thông báo WebSocket
- Đảm bảo tính toàn vẹn dữ liệu

### 7. **Error Handling & Retry Logic**

- **Network error**: Khi kết nối mất, client có thể kiểm tra session status
- **Resume**: Client biết được chunk nào đã upload, bắt đầu từ chunk tiếp theo
- **Timeout handling**: Session sẽ bị xóa sau một khoảng thời gian nếu inactive

## 🛠️ Cấu Trúc API Endpoints

### Endpoint 1: Khởi Tạo Upload Session

```
POST /api/admin/movies/:movieId/video-upload/init
Content-Type: application/json

Request:
{
  "filename": "demo.mp4",
  "fileSize": 52428800
}

Response:
{
  "success": true,
  "message": "Upload session khởi tạo thành công",
  "data": {
    "sessionId": "1_5_1234567890",
    "chunkSize": 1048576,
    "totalChunks": 50
  }
}
```

**Kiến thức**: Session ID cho phép resume sau disconnect

---

### Endpoint 2: Upload Chunk

```
POST /api/admin/movies/:movieId/video-upload/chunk
Content-Type: application/octet-stream
X-Session-Id: 1_5_1234567890
X-Chunk-Index: 0
X-Chunk-Size: 1048576

Request Body: [Binary chunk data]

Response:
{
  "success": true,
  "message": "Chunk upload thành công",
  "data": {
    "sessionId": "1_5_1234567890",
    "chunkIndex": 0,
    "uploadedSize": 1048576,
    "totalSize": 52428800,
    "percentComplete": 2
  }
}
```

**Kiến thức**:

- Content-Type `application/octet-stream`: Gửi binary data thô
- Custom headers: Lưu thông tin session và chunk
- Server ghi chunk vào file tạm thời

---

### Endpoint 3: Hoàn Thành Upload

```
POST /api/admin/movies/:movieId/video-upload/complete
Content-Type: application/json

Request:
{
  "sessionId": "1_5_1234567890"
}

Response:
{
  "success": true,
  "message": "Upload video hoàn thành thành công!",
  "data": {
    "movieId": 1,
    "videoUrl": "/uploads/1704893200000_abc123_demo.mp4",
    "totalSize": 52428800
  }
}
```

**Kiến thức**:

- Kiểm tra tất cả chunks đã upload
- Ghép file từ temp
- Cập nhật database
- Broadcast WebSocket event

---

### Endpoint 4: Kiểm Tra Progress (để Resume)

```
GET /api/admin/movies/:movieId/video-upload/status/:sessionId

Response:
{
  "success": true,
  "data": {
    "sessionId": "1_5_1234567890",
    "uploadedSize": 10485760,
    "totalSize": 52428800,
    "percentComplete": 20,
    "uploadedChunks": 10,
    "totalChunks": 50,
    "status": "in_progress"
  }
}
```

**Kiến thức**: Client có thể check progress và decide có resume hay tạo session mới

## 📊 Database Schema

### Bảng: `video_upload_sessions`

```sql
CREATE TABLE video_upload_sessions (
  id TEXT PRIMARY KEY,
  movie_id INTEGER,
  user_id INTEGER,
  original_filename TEXT,
  total_size INTEGER,
  uploaded_size INTEGER DEFAULT 0,
  chunk_size INTEGER DEFAULT 1048576,
  temp_file_path TEXT,
  status TEXT DEFAULT 'in_progress',
  created_at DATETIME,
  updated_at DATETIME
)
```

### Bảng: `video_chunks`

```sql
CREATE TABLE video_chunks (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  chunk_index INTEGER,
  chunk_size INTEGER,
  checksum TEXT,
  uploaded_at DATETIME,
  UNIQUE(session_id, chunk_index)
)
```

## 🎨 Client-Side Implementation

### Upload Flow

```
1. User chọn file video
   ↓
2. Hiển thị preview file (size, name, etc)
   ↓
3. User bấm "Bắt đầu Upload"
   ↓
4. Khởi tạo session: POST /init
   ├─ Server tạo temp file
   ├─ Lưu session vào database
   └─ Trả về sessionId
   ↓
5. Upload từng chunk:
   ├─ Chia file thành chunks
   ├─ POST /chunk cho mỗi chunk
   ├─ Update progress bar (real-time)
   └─ Lưu progress vào state (để resume)
   ↓
6. Hoàn thành: POST /complete
   ├─ Server kiểm tra all chunks
   ├─ Ghép file từ temp → uploads/
   ├─ Cập nhật movie.intro_video_url
   └─ Broadcast WebSocket event
   ↓
7. UI refresh danh sách phim
```

### Resume Logic

```
Khi network gián đoạn:
1. Client bị lỗi upload chunk X
2. User tạo lại connection hoặc refresh
3. User mở upload modal lại
4. Client giữ sessionId (nếu chưa đóng modal)
5. User bấm "Tiếp tục Upload"
6. Check progress: GET /status/{sessionId}
7. Biết được đã upload đến chunk N
8. Bắt đầu upload từ chunk N+1
9. Tiếp tục cho đến hết
```

### Progress Visualization

- **Progress Bar**: 0% → 100% (real-time update)
- **Upload Speed**: MB/s (tính từ upload time)
- **ETA**: Ước tính thời gian còn lại
- **Chunks Info**: X / Y chunks uploaded
- **Current Size**: Hiển thị dung lượng uploaded

## 📋 Hướng Dẫn Sử Dụng

### Cho Admin

1. **Đăng nhập**: admin / admin123
2. **Chọn phim**: Bấm "🎥 Upload Video" trên phim cần upload
3. **Chọn file**: Click input file, chọn video (.mp4, .webm, .ogg)
4. **Xem thông tin**: Kiểm tra tên file và kích thước
5. **Bắt đầu upload**: Bấm "Bắt đầu Upload"
6. **Monitor progress**: Xem progress bar, speed, ETA
7. **Tạm dừng (nếu cần)**: Bấm "Tạm dừng"
8. **Tiếp tục**: Bấm "Tiếp tục Upload"
9. **Hoàn thành**: Tự động refresh danh sách phim khi done

### Simulate Network Error

1. Mở DevTools (F12)
2. Bật "Offline" mode (Network tab)
3. Upload sẽ bị ngắt
4. Tắt Offline mode
5. Bấm "Tiếp tục Upload"
6. Upload sẽ tiếp tục từ chunk bị gián đoạn

## 🧪 Test Cases

### Test 1: Normal Upload

```
✅ Upload file 10MB
✅ Progress bar update smooth
✅ Speed calculation correct
✅ Complete trong 2-3 phút (tùy network)
```

### Test 2: Resume Upload

```
✅ Bắt đầu upload 50MB
❌ Network down tại 30% (sau ~15MB)
✅ Check progress: hiển thị 15MB/50MB
✅ Resume upload từ ~15MB
✅ Tiếp tục upload đến 100%
```

### Test 3: Pause & Resume

```
✅ Upload bắt đầu
⏸️ Bấm "Tạm dừng" lúc 40%
✅ Upload dừng
▶️ Bấm "Tiếp tục Upload"
✅ Upload tiếp tục từ 40%
✅ Hoàn thành
```

### Test 4: Cancel Upload

```
✅ Bắt đầu upload
❌ Bấm "Hủy" lúc 50%
✅ Upload dừng, xóa session
✅ Có thể upload lại từ đầu
```

## 🔍 Monitoring & Debugging

### Server Logs

```
📡 Upload session created: 1_5_1704893200000 (Size: 50.50MB)
📥 Chunk 0 uploaded - Session: 1_5_1704893200000 - Progress: 2%
📥 Chunk 1 uploaded - Session: 1_5_1704893200000 - Progress: 4%
...
✅ Upload completed - Session: 1_5_1704893200000 - Video: /uploads/demo.mp4
```

### Client Console (F12)

```
✅ Chọn file video: demo.mp4 (50.50 MB)
📡 Khởi tạo upload session...
✅ Session khởi tạo thành công: 1_5_1704893200000
🚀 Bắt đầu upload video...
✅ Chunk 0/50 uploaded - 2%
...
✅ Upload video thành công!
```

### Database Query

```sql
-- Xem sessions đang chạy
SELECT * FROM video_upload_sessions WHERE status = 'in_progress';

-- Xem chunks của session
SELECT * FROM video_chunks WHERE session_id = '1_5_1704893200000' ORDER BY chunk_index;

-- Xem progress
SELECT
  session_id,
  uploaded_size,
  total_size,
  ROUND(100.0 * uploaded_size / total_size, 2) as percent
FROM video_upload_sessions;
```

## 🚀 Advanced Features (Có thể thêm sau)

1. **Parallel Chunk Upload**: Upload nhiều chunks cùng lúc
2. **Bandwidth Throttling**: Giới hạn speed upload
3. **Encryption**: Mã hóa chunks trên client trước gửi
4. **WebSocket Progress**: Real-time progress qua WebSocket thay vì polling
5. **S3 Integration**: Upload lên AWS S3 thay vì server local
6. **Virus Scan**: Scan video trước lưu vào database

## 📚 Tài Liệu Tham Khảo

- **HTTP Chunked Transfer**: RFC 7230
- **File API**: MDN - File API
- **XMLHttpRequest**: MDN - XMLHttpRequest
- **Node.js Streams**: Node.js Documentation
- **Resumable Upload Pattern**: Tus.io protocol
