/**
 * DATABASE SETUP - SQLite
 *
 * Kiến thức lập trình mạng:
 * - Database persistence: Lưu trữ dữ liệu bền vững thay vì in-memory
 * - Transaction: Đảm bảo tính toàn vẹn dữ liệu khi nhiều client truy cập
 * - Indexing: Tối ưu hóa query performance
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "cinema.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Database connection error:", err.message);
  } else {
    console.log("📊 Database file:", dbPath);
  }
});

// Enable foreign keys
db.run("PRAGMA foreign_keys = ON");

// ============================================
// HELPER: Promise wrapper for db
// ============================================

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ============================================
// CREATE TABLES (Async)
// ============================================

const initializeDatabase = async () => {
  try {
    // USERS TABLE
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // MOVIES TABLE
    await dbRun(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        time TEXT NOT NULL,
        date TEXT NOT NULL,
        theater TEXT NOT NULL,
        price INTEGER NOT NULL,
        poster_url TEXT,
        intro_video_url TEXT,
        uploaded_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )
    `);

    // SEATS TABLE
    await dbRun(`
      CREATE TABLE IF NOT EXISTS seats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER NOT NULL,
        seat_id TEXT NOT NULL,
        status TEXT DEFAULT 'available',
        user_id INTEGER,
        reserved_until DATETIME,
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(movie_id, seat_id)
      )
    `);

    // BOOKINGS TABLE
    await dbRun(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        seats TEXT NOT NULL,
        total_price INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        booked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (movie_id) REFERENCES movies(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // VIDEO_UPLOAD_SESSIONS TABLE - Lưu trạng thái upload session
    await dbRun(`
      CREATE TABLE IF NOT EXISTS video_upload_sessions (
        id TEXT PRIMARY KEY,
        movie_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        original_filename TEXT NOT NULL,
        total_size INTEGER NOT NULL,
        uploaded_size INTEGER DEFAULT 0,
        chunk_size INTEGER DEFAULT 1048576,
        temp_file_path TEXT NOT NULL,
        status TEXT DEFAULT 'in_progress',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // VIDEO_CHUNKS TABLE - Lưu trạng thái chunks đã upload
    await dbRun(`
      CREATE TABLE IF NOT EXISTS video_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        checksum TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES video_upload_sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, chunk_index)
      )
    `);

    // CREATE INDEXES
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id)`
    );
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_bookings_movie ON bookings(movie_id)`
    );
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_seats_movie ON seats(movie_id)`
    );
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_movies_date ON movies(date)`);
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_video_sessions_movie ON video_upload_sessions(movie_id)`
    );
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_video_sessions_user ON video_upload_sessions(user_id)`
    );
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_video_chunks_session ON video_chunks(session_id)`
    );

    console.log("✅ Database tables initialized");

    // Seed test data
    await seedDatabase();
  } catch (error) {
    console.error("❌ Database initialization error:", error.message);
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// ============================================
// USER FUNCTIONS
// ============================================

async function createUser(username, email, password, role = "user") {
  try {
    const hashedPassword = hashPassword(password);
    const result = await dbRun(
      `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
      [username, email, hashedPassword, role]
    );
    return { id: result.lastID, username, email, role };
  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      throw new Error("Username hoặc email đã tồn tại");
    }
    throw error;
  }
}

async function getUserByUsername(username) {
  return await dbGet(`SELECT * FROM users WHERE username = ?`, [username]);
}

async function getUserById(id) {
  return await dbGet(
    `SELECT id, username, email, role, created_at FROM users WHERE id = ?`,
    [id]
  );
}

// ============================================
// MOVIE FUNCTIONS
// ============================================

async function createMovie(data) {
  const {
    title,
    description,
    time,
    date,
    theater,
    price,
    poster_url,
    uploaded_by,
  } = data;

  const result = await dbRun(
    `INSERT INTO movies (title, description, time, date, theater, price, poster_url, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, description, time, date, theater, price, poster_url, uploaded_by]
  );

  return result.lastID;
}

async function getAllMovies() {
  return await dbAll(`
    SELECT m.*, u.username as uploaded_by_name
    FROM movies m
    LEFT JOIN users u ON m.uploaded_by = u.id
    ORDER BY m.date, m.time
  `);
}

async function getMovieById(movieId) {
  return await dbGet(
    `
    SELECT m.*, u.username as uploaded_by_name
    FROM movies m
    LEFT JOIN users u ON m.uploaded_by = u.id
    WHERE m.id = ?
  `,
    [movieId]
  );
}

async function updateMovie(movieId, data) {
  const {
    title,
    description,
    time,
    date,
    theater,
    price,
    poster_url,
    intro_video_url,
  } = data;

  const updates = [];
  const params = [];

  if (title !== undefined) {
    updates.push("title = ?");
    params.push(title);
  }
  if (description !== undefined) {
    updates.push("description = ?");
    params.push(description);
  }
  if (time !== undefined) {
    updates.push("time = ?");
    params.push(time);
  }
  if (date !== undefined) {
    updates.push("date = ?");
    params.push(date);
  }
  if (theater !== undefined) {
    updates.push("theater = ?");
    params.push(theater);
  }
  if (price !== undefined) {
    updates.push("price = ?");
    params.push(price);
  }
  if (poster_url !== undefined) {
    updates.push("poster_url = ?");
    params.push(poster_url);
  }
  if (intro_video_url !== undefined) {
    updates.push("intro_video_url = ?");
    params.push(intro_video_url);
  }

  if (updates.length === 0) {
    throw new Error("Không có thông tin nào để cập nhật");
  }

  params.push(movieId);

  const sql = `UPDATE movies SET ${updates.join(", ")} WHERE id = ?`;
  await dbRun(sql, params);
}

async function deleteMovie(movieId) {
  // Xóa tất cả ghế của phim (do foreign key cascade)
  await dbRun("DELETE FROM seats WHERE movie_id = ?", [movieId]);

  // Xóa tất cả đặt vé của phim
  await dbRun("DELETE FROM bookings WHERE movie_id = ?", [movieId]);

  // Xóa phim
  await dbRun("DELETE FROM movies WHERE id = ?", [movieId]);
}

// ============================================
// SEAT FUNCTIONS
// ============================================

async function initializeSeatsForMovie(movieId) {
  const seats = [];
  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 10; col++) {
      const seatId = `${String.fromCharCode(64 + row)}${col}`;
      seats.push([movieId, seatId]);
    }
  }

  for (const [mid, sid] of seats) {
    try {
      await dbRun(
        `INSERT INTO seats (movie_id, seat_id, status) VALUES (?, ?, 'available')`,
        [mid, sid]
      );
    } catch (error) {
      // Ignore if already exists
    }
  }
}

async function getSeatsByMovie(movieId) {
  return await dbAll(
    `SELECT * FROM seats WHERE movie_id = ? ORDER BY seat_id`,
    [movieId]
  );
}

async function updateSeatStatus(movieId, seatId, status, userId = null) {
  const reserved_until =
    status === "selected"
      ? new Date(Date.now() + 5 * 60000).toISOString()
      : null;

  await dbRun(
    `UPDATE seats SET status = ?, user_id = ?, reserved_until = ? WHERE movie_id = ? AND seat_id = ?`,
    [status, userId, reserved_until, movieId, seatId]
  );
}

async function releaseExpiredReservations() {
  await dbRun(`
    UPDATE seats
    SET status = 'available', user_id = NULL, reserved_until = NULL
    WHERE status = 'selected' AND reserved_until < CURRENT_TIMESTAMP
  `);
}

// ============================================
// BOOKING FUNCTIONS
// ============================================

async function createBooking(movieId, userId, seats, totalPrice) {
  const seatsJson = JSON.stringify(seats);
  const result = await dbRun(
    `INSERT INTO bookings (movie_id, user_id, seats, total_price, status)
     VALUES (?, ?, ?, ?, 'confirmed')`,
    [movieId, userId, seatsJson, totalPrice]
  );

  return result.lastID;
}

async function getUserBookings(userId) {
  return await dbAll(
    `
    SELECT b.*, m.title, m.date, m.time
    FROM bookings b
    LEFT JOIN movies m ON b.movie_id = m.id
    WHERE b.user_id = ?
    ORDER BY b.booked_at DESC
  `,
    [userId]
  );
}

async function getAllBookings() {
  return await dbAll(`
    SELECT b.*, m.title, u.username
    FROM bookings b
    LEFT JOIN movies m ON b.movie_id = m.id
    LEFT JOIN users u ON b.user_id = u.id
    ORDER BY b.booked_at DESC
  `);
}

// ============================================
// VIDEO UPLOAD SESSIONS - Resumable Upload
// ============================================

/**
 * Tạo một upload session mới
 * Kiến thức lập trình mạng: Session ID cho phép resume upload sau khi disconnect
 */
async function createVideoUploadSession(
  movieId,
  userId,
  filename,
  totalSize,
  chunkSize = 1048576
) {
  const sessionId = `${movieId}_${userId}_${Date.now()}`;
  const tempFilePath = path.join(__dirname, `../uploads/temp/${sessionId}`);

  try {
    await dbRun(
      `
      INSERT INTO video_upload_sessions 
      (id, movie_id, user_id, original_filename, total_size, uploaded_size, chunk_size, temp_file_path, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        sessionId,
        movieId,
        userId,
        filename,
        totalSize,
        0,
        chunkSize,
        tempFilePath,
        "in_progress",
      ]
    );

    return sessionId;
  } catch (error) {
    throw new Error(`Lỗi tạo upload session: ${error.message}`);
  }
}

/**
 * Lấy thông tin session upload
 */
async function getVideoUploadSession(sessionId) {
  return await dbGet(`SELECT * FROM video_upload_sessions WHERE id = ?`, [
    sessionId,
  ]);
}

/**
 * Lưu chunk đã upload
 */
async function saveUploadedChunk(sessionId, chunkIndex, chunkSize, checksum) {
  try {
    await dbRun(
      `
      INSERT INTO video_chunks (session_id, chunk_index, chunk_size, checksum)
      VALUES (?, ?, ?, ?)
    `,
      [sessionId, chunkIndex, chunkSize, checksum]
    );

    // Cập nhật uploaded_size
    const uploadedChunks = await dbAll(
      `SELECT SUM(chunk_size) as total FROM video_chunks WHERE session_id = ?`,
      [sessionId]
    );

    const uploadedSize = uploadedChunks[0].total || 0;

    await dbRun(
      `UPDATE video_upload_sessions SET uploaded_size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [uploadedSize, sessionId]
    );

    return uploadedSize;
  } catch (error) {
    throw new Error(`Lỗi lưu chunk: ${error.message}`);
  }
}

/**
 * Lấy danh sách chunks đã upload
 */
async function getUploadedChunks(sessionId) {
  return await dbAll(
    `SELECT * FROM video_chunks WHERE session_id = ? ORDER BY chunk_index ASC`,
    [sessionId]
  );
}

/**
 * Hoàn thành upload session
 */
async function completeVideoUploadSession(sessionId) {
  try {
    await dbRun(
      `UPDATE video_upload_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ["completed", sessionId]
    );
  } catch (error) {
    throw new Error(`Lỗi hoàn thành session: ${error.message}`);
  }
}

/**
 * Hủy upload session
 */
async function cancelVideoUploadSession(sessionId) {
  try {
    const session = await getVideoUploadSession(sessionId);
    if (session && fs.existsSync(session.temp_file_path)) {
      fs.unlinkSync(session.temp_file_path);
    }

    await dbRun(`DELETE FROM video_chunks WHERE session_id = ?`, [sessionId]);

    await dbRun(`DELETE FROM video_upload_sessions WHERE id = ?`, [sessionId]);
  } catch (error) {
    throw new Error(`Lỗi hủy session: ${error.message}`);
  }
}

// ============================================
// SEED DATA
// ============================================

async function seedDatabase() {
  try {
    const result = await dbGet("SELECT COUNT(*) as count FROM users");
    if (result.count === 0) {
      console.log("📝 Seeding test data...");

      await createUser("admin", "admin@cinema.com", "admin123", "admin");
      console.log("✅ Admin created: admin / admin123");

      await createUser("user1", "user1@cinema.com", "user123", "user");
      console.log("✅ User created: user1 / user123");
    }
  } catch (error) {
    console.error("❌ Seed error:", error.message);
  }
}

// ============================================
// INITIALIZE ON REQUIRE
// ============================================

// Delay initialization to allow module loading
setTimeout(() => {
  initializeDatabase();
}, 100);

// ============================================
// EXPORT
// ============================================

module.exports = {
  db,
  // User functions
  createUser,
  getUserByUsername,
  getUserById,
  hashPassword,
  verifyPassword,
  // Movie functions
  createMovie,
  getAllMovies,
  getMovieById,
  updateMovie,
  deleteMovie,
  // Seat functions
  initializeSeatsForMovie,
  getSeatsByMovie,
  updateSeatStatus,
  releaseExpiredReservations,
  // Booking functions
  createBooking,
  getUserBookings,
  getAllBookings,
  // Video upload functions
  createVideoUploadSession,
  getVideoUploadSession,
  saveUploadedChunk,
  getUploadedChunks,
  completeVideoUploadSession,
  cancelVideoUploadSession,
};
