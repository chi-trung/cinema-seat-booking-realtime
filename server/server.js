/**
 * CINEMA REALTIME BOOKING SYSTEM - SERVER
 * 
 * Dự án môn Lập trình mạng
 * Mô tả các khái niệm:
 * 1. Client-Server Architecture: Server xử lý logic, client hiển thị UI
 * 2. HTTP REST API: Các endpoint GET/POST để quản lý dữ liệu
 * 3. WebSocket: Socket.io để cập nhật real-time trạng thái ghế
 * 4. Đồng bộ dữ liệu: Broadcast thay đổi đến tất cả clients
 * 5. Xử lý đồng thời: Node.js event loop xử lý nhiều kết nối
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

// Khởi tạo Express app (HTTP REST Server)
const app = express();
const server = http.createServer(app);

// Khởi tạo Socket.IO (WebSocket Server)
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// ============================================
// DATABASE (In-memory storage)
// ============================================

// Danh sách phim
const movies = [
  {
    id: 1,
    title: "Avatar: The Way of Water",
    time: "19:00",
    date: "2026-01-15",
    theater: "Rạp 1",
    price: 100000
  },
  {
    id: 2,
    title: "Avengers: Endgame",
    time: "21:00",
    date: "2026-01-15",
    theater: "Rạp 2",
    price: 120000
  },
  {
    id: 3,
    title: "Spider-Man: No Way Home",
    time: "18:00",
    date: "2026-01-16",
    theater: "Rạp 1",
    price: 100000
  }
];

// Trạng thái ghế cho từng phim
// Structure: { movieId: { seatId: { status, userId, timestamp } } }
const seatsStatus = {};

// Khởi tạo ghế cho mỗi phim (10 hàng x 10 ghế)
movies.forEach(movie => {
  seatsStatus[movie.id] = {};
  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 10; col++) {
      const seatId = `${String.fromCharCode(64 + row)}${col}`;
      seatsStatus[movie.id][seatId] = {
        status: 'available', // available, selected, booked
        userId: null,
        timestamp: null
      };
    }
  }
});

// Lưu trữ booking history
const bookings = [];

// Tracking connected clients
const connectedClients = new Map(); // socketId -> { userId, movieId }

// ============================================
// HTTP REST API ENDPOINTS
// ============================================

/**
 * ENDPOINT 1: Lấy danh sách phim
 * Method: GET
 * Mô tả: REST API để client lấy thông tin phim
 */
app.get('/api/movies', (req, res) => {
  console.log('📡 HTTP GET /api/movies - Client yêu cầu danh sách phim');
  res.json({
    success: true,
    data: movies
  });
});

/**
 * ENDPOINT 2: Lấy thông tin chi tiết 1 phim
 * Method: GET
 */
app.get('/api/movies/:id', (req, res) => {
  const movieId = parseInt(req.params.id);
  console.log(`📡 HTTP GET /api/movies/${movieId}`);
  
  const movie = movies.find(m => m.id === movieId);
  
  if (!movie) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy phim'
    });
  }
  
  res.json({
    success: true,
    data: movie
  });
});

/**
 * ENDPOINT 3: Lấy trạng thái ghế của phim
 * Method: GET
 */
app.get('/api/movies/:id/seats', (req, res) => {
  const movieId = parseInt(req.params.id);
  console.log(`📡 HTTP GET /api/movies/${movieId}/seats`);
  
  if (!seatsStatus[movieId]) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy phim'
    });
  }
  
  res.json({
    success: true,
    data: seatsStatus[movieId]
  });
});

/**
 * ENDPOINT 4: Xác nhận đặt vé (checkout)
 * Method: POST
 * Mô tả: REST API để hoàn tất booking
 */
app.post('/api/bookings', (req, res) => {
  const { movieId, seats, userId, userName } = req.body;
  
  console.log(`📡 HTTP POST /api/bookings - User ${userName} đặt ${seats.length} ghế`);
  
  if (!movieId || !seats || !userId || !userName) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu thông tin'
    });
  }
  
  // Kiểm tra ghế có available không
  const movieSeats = seatsStatus[movieId];
  for (let seatId of seats) {
    if (!movieSeats[seatId] || movieSeats[seatId].status !== 'selected' || movieSeats[seatId].userId !== userId) {
      return res.status(400).json({
        success: false,
        message: `Ghế ${seatId} không khả dụng hoặc không thuộc về bạn`
      });
    }
  }
  
  // Đánh dấu ghế là đã đặt
  seats.forEach(seatId => {
    movieSeats[seatId].status = 'booked';
    movieSeats[seatId].timestamp = Date.now();
  });
  
  // Lưu booking
  const booking = {
    id: bookings.length + 1,
    movieId,
    seats,
    userId,
    userName,
    timestamp: Date.now(),
    movie: movies.find(m => m.id === movieId)
  };
  bookings.push(booking);
  
  // Broadcast cập nhật đến tất cả clients (WebSocket)
  io.emit('seats-updated', {
    movieId,
    seats: movieSeats
  });
  
  res.json({
    success: true,
    message: 'Đặt vé thành công',
    data: booking
  });
});

/**
 * ENDPOINT 5: Lấy lịch sử booking
 * Method: GET
 */
app.get('/api/bookings', (req, res) => {
  console.log('📡 HTTP GET /api/bookings');
  res.json({
    success: true,
    data: bookings
  });
});

/**
 * ENDPOINT 6: Server status
 * Method: GET
 */
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      connectedClients: connectedClients.size,
      totalBookings: bookings.length,
      uptime: process.uptime()
    }
  });
});

// ============================================
// WEBSOCKET (SOCKET.IO) HANDLERS
// ============================================

/**
 * Xử lý kết nối WebSocket
 * Mỗi client kết nối sẽ có 1 socket riêng
 * Node.js xử lý đồng thời nhiều connections
 */
io.on('connection', (socket) => {
  console.log(`🔌 WebSocket: Client connected [ID: ${socket.id}]`);
  console.log(`📊 Tổng số clients đang kết nối: ${connectedClients.size + 1}`);
  
  /**
   * EVENT 1: Client tham gia xem phim
   */
  socket.on('join-movie', (data) => {
    const { movieId, userId } = data;
    console.log(`👤 User ${userId} tham gia xem phim ${movieId} (Socket: ${socket.id})`);
    
    // Lưu thông tin client
    connectedClients.set(socket.id, { userId, movieId });
    
    // Join room theo movieId để broadcast hiệu quả
    socket.join(`movie-${movieId}`);
    
    // Gửi trạng thái ghế hiện tại cho client mới
    socket.emit('seats-updated', {
      movieId,
      seats: seatsStatus[movieId]
    });
    
    // Thông báo cho các clients khác
    socket.to(`movie-${movieId}`).emit('user-joined', {
      userId,
      message: `User ${userId} đã tham gia`
    });
  });
  
  /**
   * EVENT 2: Client chọn ghế
   * Real-time synchronization: Khi 1 client chọn ghế, 
   * tất cả clients khác sẽ nhận được update ngay lập tức
   */
  socket.on('select-seat', (data) => {
    const { movieId, seatId, userId } = data;
    console.log(`🪑 User ${userId} chọn ghế ${seatId} cho phim ${movieId}`);
    
    const seat = seatsStatus[movieId][seatId];
    
    // Kiểm tra ghế có available không
    if (seat.status !== 'available') {
      socket.emit('seat-error', {
        message: 'Ghế này đã được chọn hoặc đã đặt',
        seatId
      });
      return;
    }
    
    // Cập nhật trạng thái ghế
    seat.status = 'selected';
    seat.userId = userId;
    seat.timestamp = Date.now();
    
    // Broadcast đến TẤT CẢ clients trong room (bao gồm cả người gửi)
    // Đây là đồng bộ dữ liệu real-time
    io.to(`movie-${movieId}`).emit('seats-updated', {
      movieId,
      seats: seatsStatus[movieId]
    });
  });
  
  /**
   * EVENT 3: Client hủy chọn ghế
   */
  socket.on('unselect-seat', (data) => {
    const { movieId, seatId, userId } = data;
    console.log(`🚫 User ${userId} hủy chọn ghế ${seatId}`);
    
    const seat = seatsStatus[movieId][seatId];
    
    // Chỉ cho phép người đã chọn ghế mới được hủy
    if (seat.status === 'selected' && seat.userId === userId) {
      seat.status = 'available';
      seat.userId = null;
      seat.timestamp = null;
      
      // Broadcast cập nhật
      io.to(`movie-${movieId}`).emit('seats-updated', {
        movieId,
        seats: seatsStatus[movieId]
      });
    }
  });
  
  /**
   * EVENT 4: Client disconnect
   * Tự động hủy các ghế đã chọn của user này
   */
  socket.on('disconnect', () => {
    console.log(`❌ WebSocket: Client disconnected [ID: ${socket.id}]`);
    
    const clientInfo = connectedClients.get(socket.id);
    
    if (clientInfo) {
      const { userId, movieId } = clientInfo;
      
      // Tự động hủy các ghế đã chọn (chưa book)
      const movieSeats = seatsStatus[movieId];
      let releasedSeats = [];
      
      for (let seatId in movieSeats) {
        if (movieSeats[seatId].status === 'selected' && movieSeats[seatId].userId === userId) {
          movieSeats[seatId].status = 'available';
          movieSeats[seatId].userId = null;
          movieSeats[seatId].timestamp = null;
          releasedSeats.push(seatId);
        }
      }
      
      if (releasedSeats.length > 0) {
        console.log(`🔄 Tự động giải phóng ${releasedSeats.length} ghế của user ${userId}`);
        io.to(`movie-${movieId}`).emit('seats-updated', {
          movieId,
          seats: movieSeats
        });
      }
      
      // Thông báo user rời đi
      socket.to(`movie-${movieId}`).emit('user-left', {
        userId,
        message: `User ${userId} đã rời đi`
      });
      
      connectedClients.delete(socket.id);
    }
    
    console.log(`📊 Tổng số clients còn lại: ${connectedClients.size}`);
  });
  
  /**
   * EVENT 5: Ping-pong để duy trì connection
   */
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🎬 CINEMA REALTIME BOOKING SYSTEM');
  console.log('='.repeat(60));
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 HTTP REST API: http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('📚 Các khái niệm được thể hiện:');
  console.log('   ✓ Client-Server Architecture');
  console.log('   ✓ HTTP REST API (GET/POST endpoints)');
  console.log('   ✓ WebSocket real-time communication');
  console.log('   ✓ Đồng bộ dữ liệu giữa nhiều clients');
  console.log('   ✓ Xử lý nhiều kết nối đồng thời');
  console.log('='.repeat(60));
});
