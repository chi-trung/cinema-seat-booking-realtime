/**
 * CINEMA REALTIME BOOKING SYSTEM - SERVER
 *
 * Dự án môn Lập trình mạng
 *
 * Kiến thức lập trình mạng được thể hiện:
 * 1. Client-Server Architecture: Server xử lý logic, client hiển thị UI
 * 2. HTTP REST API: GET/POST endpoints để quản lý dữ liệu
 * 3. WebSocket: Socket.io để cập nhật real-time trạng thái ghế
 * 4. Authentication: JWT token + Bcrypt password hashing (Security)
 * 5. File Upload: Multipart/form-data cho admin upload phim
 * 6. Database Persistence: SQLite thay vì in-memory storage
 * 7. Role-based Access Control: Admin vs User roles
 * 8. Đồng bộ dữ liệu: Broadcast thay đổi đến tất cả clients
 */

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const fs = require("fs");

// Import database functions
const db = require("./database");

// Khởi tạo Express app
const app = express();
const server = http.createServer(app);

// Khởi tạo Socket.IO
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

// ============================================
// CONFIGURATION
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || "cinema-secret-key-2026";
const UPLOAD_DIR = path.join(__dirname, "../uploads");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Tạo folder uploads nếu không tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Cấu hình multer cho upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substr(2, 9);
    cb(null, `${timestamp}_${randomString}_${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ hỗ trợ file ảnh (JPG, PNG, WEBP)"));
    }
  },
});

// Cấu hình multer cho upload video intro
// Kiến thức lập trình mạng: Streaming file upload, Content-Type validation
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB cho video

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substr(2, 9);
    cb(null, `${timestamp}_${randomString}_${file.originalname}`);
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (req, file, cb) => {
    // Hỗ trợ các định dạng video phổ biến
    const allowedTypes = [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ hỗ trợ file video (MP4, WebM, OGG, MOV)"));
    }
  },
});

// ============================================
// MIDDLEWARE - AUTHENTICATION
// ============================================

/**
 * Middleware kiểm tra JWT token
 * Kiến thức: Token-based authentication
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token không tồn tại",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Token không hợp lệ hoặc hết hạn",
      });
    }
    req.user = user;
    next();
  });
}

/**
 * Middleware kiểm tra role Admin
 */
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Chỉ admin mới có quyền truy cập",
    });
  }
  next();
}

// ============================================
// TRACKING
// ============================================

const connectedClients = new Map(); // socketId -> { userId, movieId, userName }

// ============================================
// HTTP REST API ENDPOINTS
// ============================================

/**
 * ========== AUTHENTICATION ==========
 */

/**
 * ENDPOINT 1: Register
 * Method: POST
 * Body: { username, email, password }
 */
app.post("/api/auth/register", async (req, res) => {
  console.log("📡 HTTP POST /api/auth/register");

  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập đầy đủ thông tin",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Mật khẩu phải có ít nhất 6 ký tự",
    });
  }

  try {
    const user = await db.createUser(username, email, password, "user");
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Đăng ký thành công",
      data: { user, token },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ENDPOINT 2: Login
 * Method: POST
 * Body: { username, password }
 */
app.post("/api/auth/login", async (req, res) => {
  console.log("📡 HTTP POST /api/auth/login");

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập tên đăng nhập và mật khẩu",
    });
  }

  try {
    const user = await db.getUserByUsername(username);

    if (!user || !db.verifyPassword(password, user.password)) {
      return res.status(401).json({
        success: false,
        message: "Tên đăng nhập hoặc mật khẩu không chính xác",
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
});

/**
 * ENDPOINT 3: Get current user info
 * Method: GET
 * Requires: Token
 */
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  console.log(`📡 HTTP GET /api/auth/me (User: ${req.user.username})`);

  const user = await db.getUserById(req.user.id);

  res.json({
    success: true,
    data: user,
  });
});

/**
 * ========== MOVIES ==========
 */

/**
 * ENDPOINT 4: Lấy danh sách phim
 * Method: GET
 */
app.get("/api/movies", async (req, res) => {
  console.log("📡 HTTP GET /api/movies");

  try {
    const movies = await db.getAllMovies();
    res.json({
      success: true,
      data: movies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ENDPOINT 5: Lấy thông tin phim theo ID
 * Method: GET
 */
app.get("/api/movies/:id", async (req, res) => {
  console.log(`📡 HTTP GET /api/movies/${req.params.id}`);

  try {
    const movie = await db.getMovieById(req.params.id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Phim không tồn tại",
      });
    }

    res.json({
      success: true,
      data: movie,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ENDPOINT 6: Admin upload phim
 * Method: POST
 * Requires: Token + Admin role
 *
 * Kiến thức lập trình mạng:
 * - Multipart/form-data: Gửi file + data trong 1 request
 * - File upload: Server nhận file, lưu vào folder, lưu URL vào DB
 * - MIME type validation: Kiểm tra loại file để bảo mật
 * - Role-based access: Chỉ admin mới có quyền upload
 */
app.post(
  "/api/admin/movies",
  authenticateToken,
  adminOnly,
  upload.single("poster"),
  async (req, res) => {
    console.log(`📡 HTTP POST /api/admin/movies (Admin: ${req.user.username})`);

    const { title, description, time, date, theater, price } = req.body;

    // Validate input
    if (!title || !time || !date || !theater || !price) {
      if (req.file) {
        fs.unlinkSync(req.file.path); // Xóa file nếu upload thất bại
      }
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin phim",
      });
    }

    try {
      // Tạo URL poster
      let posterUrl = null;
      if (req.file) {
        posterUrl = `/uploads/${req.file.filename}`;
      }

      // Thêm phim vào database
      const movieId = await db.createMovie({
        title,
        description: description || "",
        time,
        date,
        theater,
        price: parseInt(price),
        poster_url: posterUrl,
        uploaded_by: req.user.id,
      });

      // Khởi tạo ghế cho phim
      await db.initializeSeatsForMovie(movieId);

      const movie = await db.getMovieById(movieId);

      // Broadcast thông tin phim mới cho tất cả clients
      io.emit("new-movie", {
        message: `Admin ${req.user.username} vừa upload phim mới: ${title}`,
        movie,
      });

      res.json({
        success: true,
        message: "Upload phim thành công",
        data: movie,
      });
    } catch (error) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ENDPOINT 7: Admin sửa phim
 * Method: PUT
 * Requires: Token + Admin role
 *
 * Kiến thức lập trình mạng:
 * - HTTP PUT method: Cập nhật toàn bộ hoặc từng phần resource
 * - Multipart/form-data: Upload file ảnh mới (optional)
 * - Admin authorization: Chỉ admin + chủ phim mới có quyền sửa
 */
app.put(
  "/api/admin/movies/:id",
  authenticateToken,
  adminOnly,
  upload.single("poster"),
  async (req, res) => {
    console.log(
      `📡 HTTP PUT /api/admin/movies/${req.params.id} (Admin: ${req.user.username})`
    );

    const movieId = req.params.id;
    const { title, description, time, date, theater, price } = req.body;

    try {
      // Kiểm tra phim tồn tại
      const movie = await db.getMovieById(movieId);
      if (!movie) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({
          success: false,
          message: "Phim không tồn tại",
        });
      }

      // Kiểm tra quyền (chỉ admin upload hoặc admin super)
      if (movie.uploaded_by !== req.user.id && req.user.username !== "admin") {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa phim này",
        });
      }

      // Chuẩn bị dữ liệu cập nhật
      const updateData = {};
      if (title) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (time) updateData.time = time;
      if (date) updateData.date = date;
      if (theater) updateData.theater = theater;
      if (price) updateData.price = parseInt(price);

      // Xử lý upload file ảnh mới
      if (req.file) {
        // Xóa ảnh cũ nếu có
        if (movie.poster_url) {
          const oldPath = path.join(__dirname, `../${movie.poster_url}`);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updateData.poster_url = `/uploads/${req.file.filename}`;
      }

      // Cập nhật vào database
      await db.updateMovie(movieId, updateData);
      const updatedMovie = await db.getMovieById(movieId);

      // Broadcast cập nhật phim cho tất cả clients
      io.emit("movie-updated", {
        message: `Admin ${req.user.username} vừa cập nhật phim: ${updatedMovie.title}`,
        movie: updatedMovie,
      });

      res.json({
        success: true,
        message: "Cập nhật phim thành công",
        data: updatedMovie,
      });
    } catch (error) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ENDPOINT 8: Admin xóa phim
 * Method: DELETE
 * Requires: Token + Admin role
 *
 * Kiến thức lập trình mạng:
 * - HTTP DELETE method: Xóa resource
 * - Cascade delete: Tự động xóa seats và bookings liên quan
 * - File cleanup: Xóa file ảnh khi xóa phim
 */
app.delete(
  "/api/admin/movies/:id",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    console.log(
      `📡 HTTP DELETE /api/admin/movies/${req.params.id} (Admin: ${req.user.username})`
    );

    const movieId = req.params.id;

    try {
      // Kiểm tra phim tồn tại
      const movie = await db.getMovieById(movieId);
      if (!movie) {
        return res.status(404).json({
          success: false,
          message: "Phim không tồn tại",
        });
      }

      // Kiểm tra quyền (chỉ admin upload hoặc admin super)
      if (movie.uploaded_by !== req.user.id && req.user.username !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xóa phim này",
        });
      }

      const movieTitle = movie.title;

      // Xóa file poster nếu có
      if (movie.poster_url) {
        const posterPath = path.join(__dirname, `../${movie.poster_url}`);
        if (fs.existsSync(posterPath)) {
          fs.unlinkSync(posterPath);
        }
      }

      // Xóa phim và tất cả dữ liệu liên quan
      await db.deleteMovie(movieId);

      // Broadcast cập nhật danh sách phim
      io.emit("movie-deleted", {
        message: `Admin ${req.user.username} vừa xóa phim: ${movieTitle}`,
        movieId,
      });

      res.json({
        success: true,
        message: "Xóa phim thành công",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ENDPOINT 9: Admin upload video intro phim
 * Method: POST
 * Requires: Token + Admin role
 * URL: /api/admin/movies/:id/upload-intro
 *
 * Kiến thức lập trình mạng:
 * - Multipart/form-data: Gửi file video trong request
 * - Content-Type validation: Kiểm tra loại file video
 * - Streaming: Xử lý file lớn (lên tới 100MB)
 * - File serving: Phát video trực tiếp từ server
 * - Dynamic file management: Upload, replace, delete video files
 */
app.post(
  "/api/admin/movies/:id/upload-intro",
  authenticateToken,
  adminOnly,
  uploadVideo.single("intro_video"),
  async (req, res) => {
    console.log(
      `📡 HTTP POST /api/admin/movies/${req.params.id}/upload-intro (Admin: ${req.user.username})`
    );

    const movieId = req.params.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn file video",
      });
    }

    try {
      // Kiểm tra phim tồn tại
      const movie = await db.getMovieById(movieId);
      if (!movie) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({
          success: false,
          message: "Phim không tồn tại",
        });
      }

      // Kiểm tra quyền
      if (movie.uploaded_by !== req.user.id && req.user.username !== "admin") {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền cập nhật phim này",
        });
      }

      // Xóa video cũ nếu có
      if (movie.intro_video_url) {
        const oldPath = path.join(__dirname, `../${movie.intro_video_url}`);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Lưu URL video vào database
      const videoUrl = `/uploads/${req.file.filename}`;
      await db.updateMovie(movieId, { intro_video_url: videoUrl });

      const updatedMovie = await db.getMovieById(movieId);

      // Broadcast cập nhật phim
      io.emit("movie-updated", {
        message: `Admin ${req.user.username} vừa cập nhật video intro cho phim: ${updatedMovie.title}`,
        movie: updatedMovie,
      });

      res.json({
        success: true,
        message: "Upload video intro thành công",
        data: {
          movieId: updatedMovie.id,
          videoUrl: videoUrl,
          videoName: req.file.originalname,
          fileSize: req.file.size,
        },
      });
    } catch (error) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ========== SEATS ==========
 */

/**
 * ENDPOINT 10: Lấy trạng thái ghế cho phim
 * Method: GET
 */
app.get("/api/movies/:movieId/seats", async (req, res) => {
  console.log(`📡 HTTP GET /api/movies/${req.params.movieId}/seats`);

  try {
    const seats = await db.getSeatsByMovie(req.params.movieId);
    res.json({
      success: true,
      data: seats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ========== BOOKINGS ==========
 */

/**
 * ENDPOINT 10: Booking vé
 * Method: POST
 * Requires: Token
 */
app.post("/api/bookings", authenticateToken, async (req, res) => {
  console.log(`📡 HTTP POST /api/bookings (User: ${req.user.username})`);

  const { movieId, seats } = req.body;

  if (!movieId || !seats || seats.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng chọn ít nhất 1 ghế",
    });
  }

  try {
    const movie = await db.getMovieById(movieId);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Phim không tồn tại",
      });
    }

    const totalPrice = movie.price * seats.length;

    // Tạo booking
    const bookingId = await db.createBooking(
      movieId,
      req.user.id,
      seats,
      totalPrice
    );

    // Cập nhật trạng thái ghế thành 'booked'
    for (const seatId of seats) {
      await db.updateSeatStatus(movieId, seatId, "booked", req.user.id);
    }

    // Broadcast cập nhật ghế đến tất cả clients
    const updatedSeats = await db.getSeatsByMovie(movieId);
    io.emit("seats-updated", {
      movieId,
      seats: updatedSeats,
    });

    res.json({
      success: true,
      message: "Booking thành công",
      data: {
        bookingId,
        totalPrice,
        seats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ENDPOINT 11: Lấy booking của user
 * Method: GET
 * Requires: Token
 */
app.get("/api/bookings/my", authenticateToken, async (req, res) => {
  console.log(`📡 HTTP GET /api/bookings/my (User: ${req.user.username})`);

  try {
    const bookings = await db.getUserBookings(req.user.id);
    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ENDPOINT 12: Lấy tất cả booking (Admin)
 * Method: GET
 * Requires: Token + Admin role
 */
app.get(
  "/api/admin/bookings",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    console.log(
      `📡 HTTP GET /api/admin/bookings (Admin: ${req.user.username})`
    );

    try {
      const bookings = await db.getAllBookings();
      res.json({
        success: true,
        data: bookings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ENDPOINT 11: Server status
 * Method: GET
 */
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    data: {
      connectedClients: connectedClients.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * ENDPOINT 12: Serve uploaded files
 */
app.use("/uploads", express.static(UPLOAD_DIR));

// ============================================
// WEBSOCKET (SOCKET.IO) HANDLERS
// ============================================

/**
 * Xử lý kết nối WebSocket
 *
 * Kiến thức: Real-time synchronization
 * Mỗi client kết nối sẽ có 1 socket riêng
 * Node.js event loop xử lý đồng thời nhiều connections
 */
io.on("connection", (socket) => {
  console.log(`🔌 WebSocket: Client connected [ID: ${socket.id}]`);

  /**
   * EVENT 1: Client tham gia xem phim
   * Kiến thức: Socket.io rooms - grouping clients
   */
  socket.on("join-movie", (data) => {
    const { movieId, userId, userName } = data;
    console.log(`👤 User ${userName} (${userId}) tham gia phim ${movieId}`);

    connectedClients.set(socket.id, { userId, movieId, userName });

    // Join room theo movieId
    socket.join(`movie-${movieId}`);

    // Gửi trạng thái ghế hiện tại
    db.getSeatsByMovie(movieId).then((seats) => {
      socket.emit("seats-updated", {
        movieId,
        seats,
      });
    });

    // Thông báo cho clients khác
    socket.to(`movie-${movieId}`).emit("user-joined", {
      userId,
      userName,
      message: `${userName} vừa tham gia xem phim`,
    });
  });

  /**
   * EVENT 2: Client chọn ghế
   * Real-time: Tất cả clients sẽ thấy ghế được chọn ngay lập tức
   */
  socket.on("select-seat", (data) => {
    const { movieId, seatId, userId } = data;
    console.log(`🪑 User ${userId} chọn ghế ${seatId}`);

    try {
      // Cập nhật vào database
      db.updateSeatStatus(movieId, seatId, "selected", userId).catch((err) => {
        console.error("❌ Error updating seat:", err.message);
      });

      // Broadcast
      db.getSeatsByMovie(movieId).then((seats) => {
        io.to(`movie-${movieId}`).emit("seats-updated", {
          movieId,
          seats,
        });
      });
    } catch (error) {
      socket.emit("seat-error", {
        message: error.message,
        seatId,
      });
    }
  });

  /**
   * EVENT 3: Client hủy chọn ghế
   */
  socket.on("unselect-seat", (data) => {
    const { movieId, seatId, userId } = data;
    console.log(`🚫 User ${userId} hủy chọn ghế ${seatId}`);

    try {
      db.updateSeatStatus(movieId, seatId, "available", null).catch((err) => {
        console.error("❌ Error updating seat:", err.message);
      });

      db.getSeatsByMovie(movieId).then((seats) => {
        io.to(`movie-${movieId}`).emit("seats-updated", {
          movieId,
          seats,
        });
      });
    } catch (error) {
      socket.emit("seat-error", { message: error.message });
    }
  });

  /**
   * EVENT 4: Client disconnect
   * Tự động release các ghế đã chọn
   */
  socket.on("disconnect", () => {
    console.log(`❌ WebSocket: Client disconnected [ID: ${socket.id}]`);

    const clientInfo = connectedClients.get(socket.id);

    if (clientInfo) {
      const { userId, movieId, userName } = clientInfo;

      // Hủy các ghế đã chọn của user
      db.getSeatsByMovie(movieId).then((seats) => {
        let releasedCount = 0;

        seats.forEach((seat) => {
          if (seat.status === "selected" && seat.user_id === userId) {
            db.updateSeatStatus(movieId, seat.seat_id, "available", null);
            releasedCount++;
          }
        });

        if (releasedCount > 0) {
          db.getSeatsByMovie(movieId).then((updatedSeats) => {
            io.to(`movie-${movieId}`).emit("seats-updated", {
              movieId,
              seats: updatedSeats,
            });
          });
        }
      });

      socket.to(`movie-${movieId}`).emit("user-left", {
        userId,
        userName,
        message: `${userName} đã rời đi`,
      });

      connectedClients.delete(socket.id);
    }

    console.log(`📊 Tổng số clients: ${connectedClients.size}`);
  });
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === "FILE_TOO_LARGE") {
      return res.status(400).json({
        success: false,
        message: "File quá lớn (tối đa 5MB)",
      });
    }
  }

  res.status(500).json({
    success: false,
    message: "Lỗi server",
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("\n" + "=".repeat(70));
  console.log(
    "🎬 CINEMA REALTIME BOOKING SYSTEM - WITH AUTHENTICATION & DATABASE"
  );
  console.log("=".repeat(70));
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 HTTP REST API: http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log("=".repeat(70));
  console.log("📚 Các khái niệm Lập trình mạng được thể hiện:");
  console.log("   ✓ Client-Server Architecture");
  console.log("   ✓ HTTP REST API (GET/POST với status codes)");
  console.log("   ✓ WebSocket real-time communication");
  console.log("   ✓ JWT Authentication & Bcrypt hashing (Security)");
  console.log("   ✓ File Upload (Multipart/form-data)");
  console.log("   ✓ Database Persistence (SQLite)");
  console.log("   ✓ Role-based Access Control");
  console.log("   ✓ Real-time Synchronization");
  console.log("   ✓ Connection Management");
  console.log("=".repeat(70));
  console.log("🧪 Test Accounts:");
  console.log("   Admin: admin / admin123");
  console.log("   User:  user1 / user123");
  console.log("=".repeat(70) + "\n");
});

module.exports = app;
