/**
 * CINEMA REALTIME BOOKING - CLIENT-SIDE APPLICATION
 *
 * Kiến thức lập trình mạng:
 * 1. HTTP REST API: Fetch data với authentication token
 * 2. WebSocket: Real-time seat updates
 * 3. JWT Token Storage: Lưu token trong localStorage
 * 4. CORS: Cross-origin requests
 * 5. Multipart/form-data: File upload cho admin
 */

// ============================================
// GLOBAL STATE
// ============================================

let socket = null;
let userId = null;
let userName = null;
let userRole = null;
let authToken = null;
let currentMovieId = null;
let selectedSeats = new Set();
let movies = [];
let currentMoviePrice = 0;

// ===== CHAT VARIABLES =====
let chatOpen = false;
let currentConversationId = null;
let currentAdminId = null;

const API_BASE = "http://localhost:3000/api";

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  log("🌐 Client khởi động", "info");

  // Kiểm tra token đã lưu
  authToken = localStorage.getItem("authToken");

  if (authToken) {
    // Auto-login nếu đã có token
    restoreSession();
  } else {
    // Hiển thị auth form
    document.getElementById("auth-section").style.display = "block";
  }
});

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Register user mới
 */
async function register() {
  const username = document.getElementById("register-username").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;

  if (!username || !email || !password) {
    alert("Vui lòng nhập đầy đủ thông tin");
    return;
  }

  try {
    log("📡 HTTP POST /api/auth/register - Đăng ký tài khoản", "info");

    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const result = await response.json();

    if (result.success) {
      authToken = result.data.token;
      const user = result.data.user;
      loginSuccess(user, authToken);
      log(`✅ Đăng ký thành công! Xin chào ${user.username}`, "success");
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi đăng ký: ${error.message}`, "error");
  }
}

/**
 * Login user
 */
async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  if (!username || !password) {
    alert("Vui lòng nhập tên đăng nhập và mật khẩu");
    return;
  }

  try {
    log("📡 HTTP POST /api/auth/login - Đăng nhập", "info");

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const result = await response.json();

    if (result.success) {
      const user = result.data.user;
      authToken = result.data.token;
      loginSuccess(user, authToken);
      log(`✅ Đăng nhập thành công! Xin chào ${user.username}`, "success");
    } else {
      alert(`❌ ${result.message}`);
      log(`❌ Đăng nhập thất bại`, "error");
    }
  } catch (error) {
    log(`❌ Lỗi đăng nhập: ${error.message}`, "error");
  }
}

/**
 * Xử lý đăng nhập thành công
 */
function loginSuccess(user, token) {
  userId = user.id;
  userName = user.username;
  userRole = user.role;

  // Lưu token
  localStorage.setItem("authToken", token);

  // Update UI
  document.getElementById("auth-section").style.display = "none";
  document.getElementById("user-section").style.display = "block";
  document.getElementById("display-username").textContent = userName;
  document.getElementById("display-role").textContent =
    userRole === "admin" ? "👨‍💼 Admin" : "👤 Người dùng";

  // Hiển thị upload form nếu là admin
  if (userRole === "admin") {
    document.getElementById("admin-section").style.display = "block";
    document.getElementById("admin-chat-section").style.display = "block";
  }

  // Hiển thị chat widget cho người dùng
  if (userRole === "user") {
    document.getElementById("chat-widget").style.display = "block";
  }

  // Kết nối WebSocket và load movies
  initializeWebSocket();
  loadMovies();
  
  // Nếu là admin, load danh sách cuộc trò chuyện
  if (userRole === "admin") {
    setTimeout(() => {
      requestConversationList();
    }, 500);
  }
}

/**
 * Restore session từ token
 */
async function restoreSession() {
  try {
    log("📡 HTTP GET /api/auth/me - Kiểm tra token", "info");

    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (response.ok) {
      const result = await response.json();
      const user = result.data;
      userId = user.id;
      userName = user.username;
      userRole = user.role;

      document.getElementById("auth-section").style.display = "none";
      document.getElementById("user-section").style.display = "block";
      document.getElementById("display-username").textContent = userName;
      document.getElementById("display-role").textContent =
        userRole === "admin" ? "👨‍💼 Admin" : "👤 Người dùng";

      // Hiển thị chat widget cho người dùng thường
      if (userRole === "user") {
        document.getElementById("chat-widget").style.display = "block";
      }

      if (userRole === "admin") {
        document.getElementById("admin-section").style.display = "block";
        document.getElementById("admin-chat-section").style.display = "block";
        // Load conversations sau khi WebSocket connect
        setTimeout(() => {
          requestConversationList();
        }, 500);
      }

      initializeWebSocket();
      loadMovies();
      log(`✅ Tự động đăng nhập thành công!`, "success");
    } else {
      // Token không hợp lệ
      localStorage.removeItem("authToken");
      authToken = null;
      document.getElementById("auth-section").style.display = "block";
    }
  } catch (error) {
    log(`⚠️ Lỗi restore session: ${error.message}`, "error");
    localStorage.removeItem("authToken");
    authToken = null;
  }
}

/**
 * Logout
 */
function logout() {
  localStorage.removeItem("authToken");
  authToken = null;
  userId = null;
  userName = null;
  userRole = null;

  if (socket) {
    socket.disconnect();
  }

  document.getElementById("user-section").style.display = "none";
  document.getElementById("admin-section").style.display = "none";
  document.getElementById("admin-chat-section").style.display = "none";
  document.getElementById("chat-widget").style.display = "none";
  document.getElementById("movies-section").style.display = "none";
  document.getElementById("seats-section").style.display = "none";
  document.getElementById("auth-section").style.display = "block";

  // Reset form
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  document.getElementById("register-username").value = "";
  document.getElementById("register-email").value = "";
  document.getElementById("register-password").value = "";

  log("👋 Đã đăng xuất", "info");
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function initializeWebSocket() {
  log("🔌 Đang kết nối WebSocket...", "info");

  socket = io("http://localhost:3000", {
    transports: ["websocket", "polling"],
    reconnectionDelay: 1000,
    reconnection: true,
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    log("✅ WebSocket đã kết nối thành công!", "success");
    updateConnectionStatus(true);
    setupSocketListeners();  // Setup listeners sau khi connect
    startPingPong();  // Start ping-pong
  });

  socket.on("disconnect", () => {
    log("❌ WebSocket ngắt kết nối", "error");
    updateConnectionStatus(false);
  });

  socket.on("connect_error", (error) => {
    log(`⚠️ Lỗi kết nối: ${error.message}`, "error");
    updateConnectionStatus(false);
  });
}

/**
 * Setup socket event listeners
 * Called after socket connects successfully
 */
function setupSocketListeners() {
  if (!socket) return;
  socket.on("chat-history", (data) => {
    if (!data || !data.messages) {
      log(`⚠️ chat-history data invalid`, "error");
      return;
    }
    log(`📨 Nhận lịch sử chat: ${data.messages.length} tin nhắn`, "info");
    renderChatMessages(data.messages);
  });
  
  socket.on("seats-updated", (data) => {
    log(`🔄 Nhận cập nhật ghế real-time cho phim ${data.movieId}`, "info");
    if (data.movieId === currentMovieId) {
      renderSeats(data.seats);
    }
  });

  socket.on("new-movie", (data) => {
    log(`🎬 ${data.message}`, "success");
    loadMovies();
  });

  socket.on("movie-updated", (data) => {
    log(`✏️ ${data.message}`, "success");
    loadMovies();
  });

  socket.on("movie-deleted", (data) => {
    log(`🗑️ ${data.message}`, "success");
    loadMovies();
  });

  socket.on("user-joined", (data) => {
    log(`👋 ${data.message}`, "info");
  });

  socket.on("user-left", (data) => {
    log(`👋 ${data.message}`, "info");
  });

  socket.on("seat-error", (data) => {
    log(`⚠️ ${data.message}`, "error");
    alert(data.message);
  });

  // ===== CHAT EVENTS =====
  socket.on("chat-history", (data) => {
    log(`📨 Received chat-history event`, "info");
    if (!data || !data.messages) {
      log(`⚠️ chat-history data invalid: ${JSON.stringify(data)}`, "error");
      return;
    }
    log(`📨 Nhận lịch sử chat: ${data.messages.length} tin nhắn`, "info");
    renderChatMessages(data.messages);
  });

  socket.on("new-message", (data) => {
    log(`💬 Tin nhắn mới từ ${data.senderName}`, "info");
    addChatMessage(data);
  });

  socket.on("admin-joined", (data) => {
    log(`👨‍💼 Admin ${data.adminName} đã tham gia`, "success");
    const messageElement = document.getElementById("chat-messages");
    if (messageElement) {
      const systemMsg = document.createElement("div");
      systemMsg.className = "chat-message system-message";
      systemMsg.innerHTML = `<em>👨‍💼 ${data.adminName} đã tham gia cuộc trò chuyện</em>`;
      messageElement.appendChild(systemMsg);
      messageElement.scrollTop = messageElement.scrollHeight;
    }
  });

  socket.on("conversation-list", (data) => {
    log(`📋 Danh sách ${data.conversations.length} cuộc trò chuyện`, "info");
    renderConversationList(data.conversations);
  });
}

// Ping-pong (run once outside socket listeners)
let pingInterval = null;
function startPingPong() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit("ping");
    }
  }, 30000);
}

function updateConnectionStatus(connected) {
  const indicator = document.getElementById("status-indicator");
  const text = document.getElementById("status-text");

  if (connected) {
    indicator.textContent = "🟢";
    text.textContent = "Đã kết nối";
  } else {
    indicator.textContent = "🔴";
    text.textContent = "Mất kết nối";
  }
}

// ============================================
// HTTP REST API CALLS
// ============================================

/**
 * Load danh sách phim
 */
async function loadMovies() {
  try {
    log("📡 HTTP GET /api/movies - Lấy danh sách phim", "info");

    const response = await fetch(`${API_BASE}/movies`);
    const result = await response.json();

    if (result.success) {
      movies = result.data;
      renderMovies(movies);
      document.getElementById("movies-section").style.display = "block";
      log(`✅ Đã tải ${movies.length} phim`, "success");
    }
  } catch (error) {
    log(`❌ Lỗi khi tải phim: ${error.message}`, "error");
  }
}

/**
 * Chọn phim
 */
function selectMovie(movieId) {
  currentMovieId = movieId;
  const movie = movies.find((m) => m.id === movieId);

  if (!movie) return;

  log(`🎬 Chọn phim: ${movie.title}`, "info");

  currentMoviePrice = movie.price;

  document.getElementById("selected-movie-title").textContent = movie.title;
  document.getElementById("selected-movie-info").textContent = `${
    movie.time
  } | ${movie.date} | ${movie.theater} | ${movie.price.toLocaleString()} VNĐ`;

  // Hiển thị video demo nếu phim có
  const videoDemoSection = document.getElementById("video-demo-section");
  if (movie.intro_video_url) {
    document.getElementById("demo-video-player").src = movie.intro_video_url;
    videoDemoSection.style.display = "block";
    log(`🎥 Hiển thị video demo: ${movie.intro_video_url}`, "info");
  } else {
    videoDemoSection.style.display = "none";
  }

  document.getElementById("movies-section").style.display = "none";
  document.getElementById("seats-section").style.display = "block";

  // Join movie room
  socket.emit("join-movie", {
    movieId: currentMovieId,
    userId: userId,
    userName: userName,
  });

  selectedSeats.clear();
  updatePrice();
}

// ============================================
// SEAT SELECTION
// ============================================

/**
 * Render ghế
 */
function renderSeats(seats) {
  const container = document.getElementById("seats-container");
  container.innerHTML = "";

  const seatsByRow = {};
  seats.forEach((seat) => {
    const row = seat.seat_id[0];
    if (!seatsByRow[row]) {
      seatsByRow[row] = [];
    }
    seatsByRow[row].push(seat);
  });

  Object.keys(seatsByRow)
    .sort()
    .forEach((row) => {
      const rowDiv = document.createElement("div");
      rowDiv.className = "seat-row";

      seatsByRow[row]
        .sort(
          (a, b) => parseInt(a.seat_id.slice(1)) - parseInt(b.seat_id.slice(1))
        )
        .forEach((seat) => {
          const seatBtn = document.createElement("button");
          seatBtn.className = `seat-btn seat-${seat.status}`;
          seatBtn.textContent = seat.seat_id;

          if (
            seat.status === "available" ||
            (seat.status === "selected" && seat.user_id === userId)
          ) {
            seatBtn.onclick = () => toggleSeat(seat.seat_id, seat.status);
          }

          if (seat.status === "selected" && seat.user_id === userId) {
            seatBtn.classList.add("selected");
          }

          rowDiv.appendChild(seatBtn);
        });

      container.appendChild(rowDiv);
    });
}

/**
 * Toggle chọn ghế
 */
function toggleSeat(seatId, status) {
  if (status === "booked") return;

  if (selectedSeats.has(seatId)) {
    selectedSeats.delete(seatId);
    socket.emit("unselect-seat", {
      movieId: currentMovieId,
      seatId: seatId,
      userId: userId,
    });
  } else {
    selectedSeats.add(seatId);
    socket.emit("select-seat", {
      movieId: currentMovieId,
      seatId: seatId,
      userId: userId,
    });
  }

  updatePrice();
}

/**
 * Cập nhật giá tiền
 */
function updatePrice() {
  const totalPrice = currentMoviePrice * selectedSeats.size;
  document.getElementById("total-price").textContent =
    totalPrice.toLocaleString() + " VNĐ";
  document.getElementById("selected-count").textContent = selectedSeats.size;
}

/**
 * Confirm booking
 */
async function confirmBooking() {
  if (selectedSeats.size === 0) {
    alert("Vui lòng chọn ít nhất 1 ghế");
    return;
  }

  try {
    log("📡 HTTP POST /api/bookings - Xác nhận đặt vé", "info");

    const response = await fetch(`${API_BASE}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        movieId: currentMovieId,
        seats: Array.from(selectedSeats),
      }),
    });

    const result = await response.json();

    if (result.success) {
      alert(
        `✅ Booking thành công!\nMã booking: ${
          result.data.bookingId
        }\nTổng tiền: ${result.data.totalPrice.toLocaleString()} VNĐ`
      );
      log(`✅ Booking thành công!`, "success");

      selectedSeats.clear();
      goBackToMovies();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi booking: ${error.message}`, "error");
    alert(`Lỗi: ${error.message}`);
  }
}

/**
 * Quay lại danh sách phim
 */
function goBackToMovies() {
  currentMovieId = null;
  selectedSeats.clear();
  document.getElementById("seats-section").style.display = "none";
  document.getElementById("video-demo-section").style.display = "none";
  document.getElementById("demo-video-player").src = "";
  document.getElementById("movies-section").style.display = "block";
}

// ============================================
// ADMIN - UPLOAD FILM
// ============================================

/**
 * Mở modal sửa phim
 */
let editingMovieId = null;

function openEditModal(movieId) {
  editingMovieId = movieId;
  const movie = movies.find((m) => m.id === movieId);

  if (!movie) {
    alert("Không tìm thấy phim");
    return;
  }

  // Điền dữ liệu phim hiện tại vào form
  document.getElementById("edit-title").value = movie.title;
  document.getElementById("edit-description").value = movie.description || "";
  document.getElementById("edit-date").value = movie.date;
  document.getElementById("edit-time").value = movie.time;
  document.getElementById("edit-theater").value = movie.theater;
  document.getElementById("edit-price").value = movie.price;
  document.getElementById("edit-poster").value = ""; // Reset file input
  document.getElementById("edit-intro-video").value = ""; // Reset video file input

  // Hiển thị thông tin video nếu phim đã có
  const videoInfoDiv = document.getElementById("current-video-info");
  if (movie.intro_video_url) {
    const videoFileName = movie.intro_video_url.split("/").pop();
    document.getElementById("current-video-name").textContent = videoFileName;
    videoInfoDiv.style.display = "block";
  } else {
    videoInfoDiv.style.display = "none";
  }

  // Hiển thị modal
  document.getElementById("edit-modal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("edit-modal").style.display = "none";
  editingMovieId = null;
}

/**
 * Lưu phim đã sửa
 */
async function saveEditedMovie() {
  if (!editingMovieId) {
    alert("Lỗi: ID phim không xác định");
    return;
  }

  const title = document.getElementById("edit-title").value.trim();
  const description = document.getElementById("edit-description").value.trim();
  const time = document.getElementById("edit-time").value;
  const date = document.getElementById("edit-date").value;
  const theater = document.getElementById("edit-theater").value.trim();
  const price = document.getElementById("edit-price").value;
  const posterFile = document.getElementById("edit-poster").files[0];
  const videoFile = document.getElementById("edit-intro-video").files[0];

  if (!title || !time || !date || !theater || !price) {
    alert("Vui lòng nhập đầy đủ thông tin phim");
    return;
  }

  try {
    log("📡 HTTP PUT /api/admin/movies/:id - Sửa phim", "info");

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("time", time);
    formData.append("date", date);
    formData.append("theater", theater);
    formData.append("price", price);
    if (posterFile) {
      formData.append("poster", posterFile);
    }

    const response = await fetch(`${API_BASE}/admin/movies/${editingMovieId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Cập nhật phim thành công!\nPhim: ${result.data.title}`);
      log(`✅ Cập nhật phim thành công!`, "success");

      // Nếu có video, upload video
      if (videoFile) {
        await uploadIntroVideo(editingMovieId);
      } else {
        closeEditModal();
        loadMovies();
      }
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi sửa phim: ${error.message}`, "error");
    alert(`Lỗi: ${error.message}`);
  }
}

/**
 * Upload video intro phim
 * Kiến thức lập trình mạng:
 * - Multipart/form-data: Gửi file video trong FormData
 * - Content-Type validation: Server kiểm tra loại file
 * - Progress tracking: Theo dõi tiến độ upload
 * - Streaming: Upload file lớn (lên tới 100MB)
 */
async function uploadIntroVideo(movieId) {
  const videoFile = document.getElementById("edit-intro-video").files[0];

  if (!videoFile) {
    alert("Vui lòng chọn file video");
    return;
  }

  // Kiểm tra kích thước file
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
  if (videoFile.size > MAX_VIDEO_SIZE) {
    alert(
      "File video quá lớn! Tối đa 100MB. File của bạn: " +
        (videoFile.size / (1024 * 1024)).toFixed(2) +
        "MB"
    );
    return;
  }

  try {
    log(
      `📡 HTTP POST /api/admin/movies/${movieId}/upload-intro - Upload video`,
      "info"
    );

    const formData = new FormData();
    formData.append("intro_video", videoFile);

    // Hiển thị progress bar
    const progressContainer = document.getElementById("video-upload-progress");
    const progressFill = document.getElementById("upload-progress");
    const uploadStatus = document.getElementById("upload-status");
    progressContainer.style.display = "block";
    progressFill.style.width = "0%";
    uploadStatus.textContent = "Đang upload... 0%";

    const xhr = new XMLHttpRequest();

    // Theo dõi tiến độ upload
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        progressFill.style.width = percentComplete + "%";
        uploadStatus.textContent = `Đang upload... ${Math.round(
          percentComplete
        )}%`;
      }
    });

    xhr.addEventListener("load", async () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        if (result.success) {
          alert(`✅ Upload video thành công!\nFile: ${result.data.videoName}`);
          log(`✅ Upload video thành công!`, "success");
          progressContainer.style.display = "none";
          document.getElementById("edit-intro-video").value = "";
          closeEditModal();
          loadMovies();
        } else {
          alert(`❌ ${result.message}`);
          progressContainer.style.display = "none";
        }
      }
    });

    xhr.addEventListener("error", () => {
      alert("❌ Lỗi upload video");
      progressContainer.style.display = "none";
      log("❌ Lỗi upload video", "error");
    });

    xhr.open("POST", `${API_BASE}/admin/movies/${movieId}/upload-intro`);
    xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
    xhr.send(formData);
  } catch (error) {
    log(`❌ Lỗi: ${error.message}`, "error");
    alert(`Lỗi: ${error.message}`);
  }
}

/**
 * Xóa phim với xác nhận
 */
function deleteMovieConfirm(movieId, movieTitle) {
  if (
    confirm(
      `⚠️ Bạn chắc chắn muốn xóa phim "${movieTitle}"?\n\nHành động này không thể hoàn tác!`
    )
  ) {
    deleteMovie(movieId);
  }
}

/**
 * Xóa phim
 */
async function deleteMovie(movieId) {
  try {
    log("📡 HTTP DELETE /api/admin/movies/:id - Xóa phim", "info");

    const response = await fetch(`${API_BASE}/admin/movies/${movieId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Xóa phim thành công!`);
      log(`✅ Xóa phim thành công!`, "success");
      loadMovies();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi xóa phim: ${error.message}`, "error");
    alert(`Lỗi: ${error.message}`);
  }
}

/**
 * Upload phim mới (Admin only)
 */
async function uploadMovie() {
  const title = document.getElementById("upload-title").value.trim();
  const description = document
    .getElementById("upload-description")
    .value.trim();
  const time = document.getElementById("upload-time").value;
  const date = document.getElementById("upload-date").value;
  const theater = document.getElementById("upload-theater").value.trim();
  const price = document.getElementById("upload-price").value;
  const posterFile = document.getElementById("upload-poster").files[0];

  if (!title || !time || !date || !theater || !price) {
    alert("Vui lòng nhập đầy đủ thông tin phim");
    return;
  }

  try {
    log("📡 HTTP POST /api/admin/movies - Upload phim", "info");

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("time", time);
    formData.append("date", date);
    formData.append("theater", theater);
    formData.append("price", price);
    if (posterFile) {
      formData.append("poster", posterFile);
    }

    const response = await fetch(`${API_BASE}/admin/movies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Upload phim thành công!\nPhim: ${result.data.title}`);
      log(`✅ Upload phim thành công!`, "success");

      // Reset form
      document.getElementById("upload-title").value = "";
      document.getElementById("upload-description").value = "";
      document.getElementById("upload-time").value = "";
      document.getElementById("upload-date").value = "";
      document.getElementById("upload-theater").value = "";
      document.getElementById("upload-price").value = "";
      document.getElementById("upload-poster").value = "";

      // Reload movies
      loadMovies();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi upload: ${error.message}`, "error");
    alert(`Lỗi: ${error.message}`);
  }
}

// ============================================
// UI UTILITIES
// ============================================

/**
 * Render danh sách phim
 */
function renderMovies(movieList) {
  const container = document.getElementById("movies-list");
  container.innerHTML = "";

  movieList.forEach((movie) => {
    const div = document.createElement("div");
    div.className = "movie-card";

    // Hiển thị nút sửa/xóa nếu user là admin
    const uploadVideoButton = !movie.intro_video_url
      ? `<button onclick="openUploadVideoModal(${movie.id})" class="btn-upload" title="Upload video demo">🎥 Upload Video</button>`
      : `<button onclick="openEditModal(${movie.id})" class="btn-has-video" title="Video demo được lưu - Edit để thay đổi">✓ Có video demo</button>`;

    const adminButtons =
      userRole === "admin"
        ? `
      <div class="admin-buttons">
        ${uploadVideoButton}
        <button onclick="openEditModal(${
          movie.id
        })" class="btn-edit" title="Sửa phim">✏️ Sửa</button>
        
        <button onclick="deleteMovieConfirm(${movie.id}, '${movie.title.replace(
            /'/g,
            "\\'"
          )}')" class="btn-delete" title="Xóa phim">🗑️ Xóa</button>
      </div>
    `
        : "";

    div.innerHTML = `
      <div class="movie-poster" style="background-image: url('${
        movie.poster_url || "https://via.placeholder.com/200x300?text=No+Poster"
      }')"></div>
      <h3>${movie.title}</h3>
      <p class="movie-info">${movie.time} | ${movie.date}</p>
      <p class="movie-info">${movie.theater}</p>
      <p class="movie-price">${movie.price.toLocaleString()} VNĐ</p>
      <button onclick="selectMovie(${
        movie.id
      })" class="btn-primary">Đặt vé</button>
      ${adminButtons}
    `;
    container.appendChild(div);
  });
}

/**
 * Logging utility
 */
function log(message, type = "info") {
  const logContainer = document.getElementById("logs");
  const logEntry = document.createElement("div");
  logEntry.className = `log-${type}`;
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // Giữ tối đa 100 log entries
  while (logContainer.children.length > 100) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

// ============================================
// RESUMABLE VIDEO UPLOAD - Global State
// ============================================

let videoUploadState = {
  currentMovieId: null,
  sessionId: null,
  videoFile: null,
  totalSize: 0,
  uploadedSize: 0,
  chunkSize: 1048576, // 1MB
  currentChunk: 0,
  totalChunks: 0,
  isUploading: false,
  isPaused: false,
  uploadStartTime: 0,
  lastChunkTime: 0,
};

/**
 * Mở modal upload video
 */
function openUploadVideoModal(movieId) {
  const movie = movies.find((m) => m.id == movieId);
  if (!movie) return;

  videoUploadState.currentMovieId = movieId;
  document.getElementById("video-upload-modal").style.display = "flex";
  document.getElementById("upload-controls").style.display = "none";
  document.getElementById("file-info").style.display = "none";
  document.getElementById("video-file-input").value = "";
  document.getElementById("upload-status-message").style.display = "none";

  log(`📹 Mở modal upload video cho phim: ${movie.title}`, "info");

  // Check và restore upload session nếu có
  checkAndRestoreUploadSession(movieId);
}

/**
 * Đóng modal upload video
 */
function closeVideoUploadModal() {
  document.getElementById("video-upload-modal").style.display = "none";

  // Xóa localStorage khi đóng modal
  if (videoUploadState.currentMovieId) {
    localStorage.removeItem(`video-upload-${videoUploadState.currentMovieId}`);
  }

  videoUploadState = {
    ...videoUploadState,
    sessionId: null,
    videoFile: null,
    totalSize: 0,
    uploadedSize: 0,
  };
}

/**
 * Xử lý chọn file video
 */
function onVideoFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  if (file.size > MAX_SIZE) {
    alert(
      `File quá lớn! Tối đa 100MB. File của bạn: ${(
        file.size /
        (1024 * 1024)
      ).toFixed(2)}MB`
    );
    return;
  }

  videoUploadState.videoFile = file;
  videoUploadState.totalSize = file.size;
  videoUploadState.totalChunks = Math.ceil(
    file.size / videoUploadState.chunkSize
  );

  // Hiển thị thông tin file
  document.getElementById("file-name").textContent = file.name;
  document.getElementById("file-size").textContent = `${(
    file.size /
    (1024 * 1024)
  ).toFixed(2)} MB`;
  document.getElementById("file-info").style.display = "block";
  document.getElementById("upload-controls").style.display = "block";

  // Reset UI
  document.getElementById("upload-progress-bar").style.width = "0%";
  document.getElementById("progress-text").textContent = "0%";
  document.getElementById("uploaded-size").textContent =
    "0 MB / " + (file.size / (1024 * 1024)).toFixed(2) + " MB";
  document.getElementById("chunks-info").textContent =
    "0 / " + videoUploadState.totalChunks;

  log(
    `✅ Chọn file video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(
      2
    )} MB)`,
    "success"
  );
}

/**
 * Khởi tạo upload session
 */
async function initUploadSession() {
  if (!videoUploadState.videoFile) {
    alert("Vui lòng chọn file video");
    return;
  }

  try {
    log("📡 Khởi tạo upload session...", "info");

    const response = await fetch(
      `${API_BASE}/admin/movies/${videoUploadState.currentMovieId}/video-upload/init`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          filename: videoUploadState.videoFile.name,
          fileSize: videoUploadState.videoFile.size,
        }),
      }
    );

    const result = await response.json();
    if (!result.success) {
      alert(`❌ ${result.message}`);
      log(`❌ Lỗi khởi tạo session: ${result.message}`, "error");
      return null;
    }

    videoUploadState.sessionId = result.data.sessionId;
    videoUploadState.chunkSize = result.data.chunkSize;

    // Lưu sessionId vào localStorage để resume nếu disconnect
    localStorage.setItem(
      `video-upload-${videoUploadState.currentMovieId}`,
      JSON.stringify({
        sessionId: result.data.sessionId,
        movieId: videoUploadState.currentMovieId,
        timestamp: Date.now(),
      })
    );

    log(`✅ Session khởi tạo thành công: ${result.data.sessionId}`, "success");
    return result.data.sessionId;
  } catch (error) {
    log(`❌ Lỗi khởi tạo session: ${error.message}`, "error");
    return null;
  }
}

/**
 * Check và restore upload session nếu có
 */
async function checkAndRestoreUploadSession(movieId) {
  const storageKey = `video-upload-${movieId}`;
  const savedSession = localStorage.getItem(storageKey);

  if (!savedSession) {
    return false;
  }

  try {
    const sessionData = JSON.parse(savedSession);
    const sessionId = sessionData.sessionId;

    log("🔍 Kiểm tra upload session cũ...", "info");

    // Check xem session còn hợp lệ không
    const statusResponse = await fetch(
      `${API_BASE}/admin/movies/${movieId}/video-upload/status/${sessionId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    if (!statusResponse.ok) {
      // Session hết hạn, xóa khỏi localStorage
      localStorage.removeItem(storageKey);
      return false;
    }

    const statusData = await statusResponse.json();
    if (!statusData.success) {
      localStorage.removeItem(storageKey);
      return false;
    }

    // Restore session data
    videoUploadState.sessionId = sessionId;
    videoUploadState.currentMovieId = movieId;
    videoUploadState.uploadedSize = statusData.data.uploadedSize;
    videoUploadState.totalSize = statusData.data.totalSize;
    videoUploadState.chunkSize = statusData.data.chunkSize;
    videoUploadState.currentChunk = statusData.data.uploadedChunks;
    videoUploadState.totalChunks = Math.ceil(
      statusData.data.totalSize / statusData.data.chunkSize
    );

    // Update UI
    const percentComplete = Math.round(
      (videoUploadState.uploadedSize / videoUploadState.totalSize) * 100
    );

    document.getElementById("upload-progress-bar").style.width =
      percentComplete + "%";
    document.getElementById("progress-text").textContent =
      Math.round(percentComplete) + "%";
    document.getElementById("uploaded-size").textContent =
      (videoUploadState.uploadedSize / (1024 * 1024)).toFixed(2) +
      " MB / " +
      (videoUploadState.totalSize / (1024 * 1024)).toFixed(2) +
      " MB";
    document.getElementById("chunks-info").textContent =
      videoUploadState.currentChunk + " / " + videoUploadState.totalChunks;

    // Hiển thị modal và button tiếp tục
    document.getElementById("video-upload-modal").style.display = "flex";
    document.getElementById("start-upload-btn").textContent = "Tiếp tục Upload";
    document.getElementById("start-upload-btn").style.display = "block";
    document.getElementById("pause-upload-btn").style.display = "none";
    document.getElementById("video-file-input").disabled = true;

    log(`✅ Phục hồi upload session: ${percentComplete}% đã upload`, "success");
    showUploadStatusMessage(
      `ℹ️ Upload trước đó: ${percentComplete}% hoàn thành. Nhấn 'Tiếp tục Upload' để tiếp tục.`,
      "info"
    );

    return true;
  } catch (error) {
    log(`⚠️ Không thể phục hồi session: ${error.message}`, "warning");
    localStorage.removeItem(storageKey);
    return false;
  }
}

/**
 * Upload một chunk
 */
async function uploadChunk(chunkIndex) {
  const file = videoUploadState.videoFile;
  const chunkSize = videoUploadState.chunkSize;
  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, file.size);
  const chunk = file.slice(start, end);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const chunkData = reader.result;

        const xhr = new XMLHttpRequest();

        xhr.onload = () => {
          if (xhr.status === 200) {
            const result = JSON.parse(xhr.responseText);
            if (result.success) {
              resolve(result.data);
            } else {
              reject(new Error(result.message));
            }
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error - chunk upload failed"));
        };

        xhr.open(
          "POST",
          `${API_BASE}/admin/movies/${videoUploadState.currentMovieId}/video-upload/chunk`
        );
        xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
        xhr.setRequestHeader("X-Session-Id", videoUploadState.sessionId);
        xhr.setRequestHeader("X-Chunk-Index", chunkIndex.toString());
        xhr.setRequestHeader("X-Chunk-Size", (end - start).toString());
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        xhr.send(chunkData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("File read error"));
    };

    reader.readAsArrayBuffer(chunk);
  });
}

/**
 * Bắt đầu upload video với hỗ trợ resume
 */
async function startVideoUpload() {
  if (!videoUploadState.videoFile) {
    alert("Vui lòng chọn file video");
    return;
  }

  // Nếu chưa có session, khởi tạo mới
  if (!videoUploadState.sessionId) {
    const sessionId = await initUploadSession();
    if (!sessionId) return;
  }

  // Kiểm tra session có còn hợp lệ không (check progress)
  try {
    const statusResponse = await fetch(
      `${API_BASE}/admin/movies/${videoUploadState.currentMovieId}/video-upload/status/${videoUploadState.sessionId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    if (!statusResponse.ok) {
      // Session hết hạn, tạo mới
      log("⚠️ Session hết hạn, tạo session mới...", "warning");
      const sessionId = await initUploadSession();
      if (!sessionId) return;
    } else {
      const statusData = await statusResponse.json();
      if (statusData.success) {
        videoUploadState.uploadedSize = statusData.data.uploadedSize;
        videoUploadState.currentChunk = statusData.data.uploadedChunks;

        if (videoUploadState.uploadedSize > 0) {
          log(
            `ℹ️ Tiếp tục upload từ ${(
              videoUploadState.uploadedSize /
              (1024 * 1024)
            ).toFixed(2)} MB (chunk ${videoUploadState.currentChunk}/${
              videoUploadState.totalChunks
            })`,
            "info"
          );
        }
      }
    }
  } catch (error) {
    log(`⚠️ Không thể kiểm tra session: ${error.message}`, "warning");
  }

  // Bắt đầu upload
  videoUploadState.isUploading = true;
  videoUploadState.isPaused = false;
  videoUploadState.uploadStartTime = Date.now();
  videoUploadState.lastChunkTime = Date.now();

  document.getElementById("start-upload-btn").style.display = "none";
  document.getElementById("pause-upload-btn").style.display = "block";
  document.getElementById("video-file-input").disabled = true;

  log("🚀 Bắt đầu upload video...", "info");

  // Upload từng chunk
  for (
    let i = videoUploadState.currentChunk;
    i < videoUploadState.totalChunks;
    i++
  ) {
    // Kiểm tra pause
    while (videoUploadState.isPaused) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Kiểm tra isUploading (có thể đã cancel)
    if (!videoUploadState.isUploading) {
      log("⚠️ Upload đã bị hủy", "warning");
      return;
    }

    try {
      const before = Date.now();
      const result = await uploadChunk(i);

      const now = Date.now();
      const chunkTime = (now - before) / 1000;
      const uploadedSize = result.uploadedSize;
      const percentComplete = result.percentComplete;

      videoUploadState.uploadedSize = uploadedSize;
      videoUploadState.currentChunk = i + 1;

      // Tính toán speed và ETA
      const totalTime = (now - videoUploadState.uploadStartTime) / 1000;
      const avgSpeed = uploadedSize / (1024 * 1024) / totalTime;
      const remainingSize = videoUploadState.totalSize - uploadedSize;
      const eta = remainingSize / (avgSpeed * 1024 * 1024);

      // Update UI
      document.getElementById("upload-progress-bar").style.width =
        percentComplete + "%";
      document.getElementById("progress-text").textContent =
        Math.round(percentComplete) + "%";
      document.getElementById("uploaded-size").textContent =
        (uploadedSize / (1024 * 1024)).toFixed(2) +
        " MB / " +
        (videoUploadState.totalSize / (1024 * 1024)).toFixed(2) +
        " MB";
      document.getElementById("upload-speed").textContent =
        avgSpeed.toFixed(2) + " MB/s";
      document.getElementById("chunks-info").textContent =
        videoUploadState.currentChunk + " / " + videoUploadState.totalChunks;

      const etaMinutes = Math.floor(eta / 60);
      const etaSeconds = Math.floor(eta % 60);
      document.getElementById("time-remaining").textContent =
        etaMinutes > 0 ? `${etaMinutes}m${etaSeconds}s` : `${etaSeconds}s`;

      log(
        `✅ Chunk ${i + 1}/${
          videoUploadState.totalChunks
        } uploaded - ${percentComplete}%`,
        "success"
      );
    } catch (error) {
      log(`❌ Lỗi upload chunk ${i}: ${error.message}`, "error");
      showUploadStatusMessage(
        `❌ Lỗi: ${error.message}. Bạn có thể tiếp tục upload sau.`,
        "error"
      );
      videoUploadState.isUploading = false;
      document.getElementById("pause-upload-btn").style.display = "none";
      document.getElementById("start-upload-btn").style.display = "block";
      document.getElementById("video-file-input").disabled = false;
      return;
    }
  }

  // Hoàn thành upload
  await completeUpload();
}

/**
 * Tạm dừng upload
 */
function pauseVideoUpload() {
  videoUploadState.isPaused = true;
  document.getElementById("pause-upload-btn").style.display = "none";
  document.getElementById("start-upload-btn").style.display = "block";
  document.getElementById("start-upload-btn").textContent = "Tiếp tục Upload";
  log("⏸️ Upload đã tạm dừng", "info");
  showUploadStatusMessage(
    "⏸️ Upload đã tạm dừng. Nhấn 'Tiếp tục Upload' để tiếp tục.",
    "warning"
  );
}

/**
 * Hủy upload
 */
async function cancelVideoUpload() {
  if (!confirm("⚠️ Bạn chắc chắn muốn hủy upload?")) return;

  videoUploadState.isUploading = false;
  videoUploadState.isPaused = false;

  document.getElementById("pause-upload-btn").style.display = "none";
  document.getElementById("start-upload-btn").style.display = "block";
  document.getElementById("start-upload-btn").textContent = "Bắt đầu Upload";
  document.getElementById("video-file-input").disabled = false;

  log("🗑️ Upload đã bị hủy", "warning");
}

/**
 * Hoàn thành upload
 */
async function completeUpload() {
  try {
    log("📡 Hoàn thành upload video...", "info");
    console.log(
      "🔍 Debug: Gọi API complete với sessionId:",
      videoUploadState.sessionId
    );

    const response = await fetch(
      `${API_BASE}/admin/movies/${videoUploadState.currentMovieId}/video-upload/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sessionId: videoUploadState.sessionId,
        }),
      }
    );

    console.log("🔍 Debug: Response status:", response.status);
    const result = await response.json();
    console.log("🔍 Debug: Response data:", result);

    if (result.success) {
      document.getElementById("upload-progress-bar").style.width = "100%";
      document.getElementById("progress-text").textContent = "100%";

      const successMsg = `✅ Upload video hoàn thành thành công!\n\nFile: ${
        result.data.videoName
      }\nDung lượng: ${(result.data.totalSize / (1024 * 1024)).toFixed(2)} MB`;

      showUploadStatusMessage(
        "✅ Upload video hoàn thành thành công!",
        "success"
      );
      log(
        `✅ Upload video thành công! File: ${result.data.videoName}`,
        "success"
      );

      alert(successMsg);

      // Reset UI
      setTimeout(() => {
        closeVideoUploadModal();
        loadMovies();
      }, 1500);
    } else {
      showUploadStatusMessage(`❌ ${result.message}`, "error");
      log(`❌ Lỗi hoàn thành upload: ${result.message}`, "error");
      alert(`❌ Lỗi: ${result.message}`);
    }
  } catch (error) {
    console.error("🔍 Debug: Error:", error);
    showUploadStatusMessage(`❌ Lỗi: ${error.message}`, "error");
    log(`❌ Lỗi hoàn thành upload: ${error.message}`, "error");
    alert(`❌ Lỗi upload: ${error.message}`);
  }

  videoUploadState.isUploading = false;
  document.getElementById("pause-upload-btn").style.display = "none";
  document.getElementById("start-upload-btn").style.display = "block";
  document.getElementById("video-file-input").disabled = false;
}

/**
 * Hiển thị message upload status
 */
function showUploadStatusMessage(message, type) {
  const element = document.getElementById("upload-status-message");
  element.textContent = message;
  element.style.display = "block";

  if (type === "success") {
    element.style.backgroundColor = "#d4edda";
    element.style.color = "#155724";
    element.style.border = "1px solid #c3e6cb";
  } else if (type === "error") {
    element.style.backgroundColor = "#f8d7da";
    element.style.color = "#721c24";
    element.style.border = "1px solid #f5c6cb";
  } else if (type === "warning") {
    element.style.backgroundColor = "#fff3cd";
    element.style.color = "#856404";
    element.style.border = "1px solid #ffeaa7";
  }
}

// ============================================
// CHAT FEATURE - Kiến thức lập trình mạng
// ============================================
// WebSocket: Gửi tin nhắn real-time
// Pub-Sub pattern: Admin subscribe tất cả conversations
// Message persistence: Lưu vào database
// User isolation: Mỗi user chỉ thấy conversation của mình

/**
 * Toggle chat window
 */
function toggleChat() {
  const chatWindow = document.getElementById("chat-window");
  const chatBubble = document.getElementById("chat-bubble");
  
  if (!chatWindow) return;
  
  chatOpen = !chatOpen;
  
  if (chatOpen) {
    chatWindow.style.display = "block";
    chatBubble.style.opacity = "0.5";
    
    // Load chat history nếu chưa có conversation
    if (!currentConversationId && socket && socket.connected) {
      socket.emit("join-chat", {
        userId: userId,
        userName: userName,
      });
    }
    
    // Focus input
    setTimeout(() => {
      document.getElementById("chat-input").focus();
    }, 100);
  } else {
    chatWindow.style.display = "none";
    chatBubble.style.opacity = "1";
  }
}

/**
 * Xử lý input chat (Enter để gửi)
 */
function handleChatInput(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

/**
 * Gửi tin nhắn chat
 */
function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  
  if (!message) return;
  
  if (!socket || !socket.connected) {
    alert("❌ Mất kết nối tới server. Vui lòng kiểm tra lại!");
    return;
  }
  
  // Emit event gửi tin nhắn
  socket.emit("send-message", {
    conversationId: currentConversationId,
    senderId: userId,
    senderName: userName,
    message: message,
    timestamp: new Date().toISOString(),
  });
  
  // Clear input
  input.value = "";
  input.focus();
  
  log(`💬 Bạn gửi: ${message}`, "info");
}

/**
 * Thêm tin nhắn mới vào chat
 */
function addChatMessage(data) {
  // Determine correct container based on role
  let messagesContainer = null;
  
  if (userRole === "admin") {
    messagesContainer = document.getElementById("admin-chat-messages");
  } else {
    messagesContainer = document.getElementById("chat-messages");
  }
  
  if (!messagesContainer) return;
  
  const messageEl = document.createElement("div");
  messageEl.className = `chat-message ${data.senderId === userId ? "user-message" : "admin-message"}`;
  
  const time = new Date(data.timestamp || data.created_at).toLocaleTimeString("vi-VN");
  messageEl.innerHTML = `
    <div class="chat-message-header">
      <strong>${data.senderName || data.sender_name}</strong>
      <span class="chat-time">${time}</span>
    </div>
    <div class="chat-message-body">${escapeHtml(data.message)}</div>
  `;
  
  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Render chat messages
 */
function renderChatMessages(messages) {
  // Determine correct container based on role
  let messagesContainer = null;
  
  if (userRole === "admin") {
    messagesContainer = document.getElementById("admin-chat-messages");
  } else {
    messagesContainer = document.getElementById("chat-messages");
  }
  
  if (!messagesContainer) return;
  
  messagesContainer.innerHTML = "";
  
  messages.forEach((msg) => {
    addChatMessage(msg);
  });
}

/**
 * Render conversation list (cho admin)
 */
function renderConversationList(conversations) {
  const listContainer = document.getElementById("admin-conversations-list");
  if (!listContainer) return;
  
  if (conversations.length === 0) {
    listContainer.innerHTML = "<p>Chưa có cuộc trò chuyện nào</p>";
    return;
  }
  
  listContainer.innerHTML = conversations
    .map((conv) => `
      <div class="conversation-item" data-user-id="${conv.userId}" data-user-name="${escapeHtml(conv.userName)}" onclick="openConversationFromElement(this)">
        <div class="conversation-name">${escapeHtml(conv.userName)}</div>
        <div class="conversation-preview">${escapeHtml(conv.lastMessage)}</div>
        <div class="conversation-time">${new Date(conv.lastMessageTime).toLocaleString("vi-VN")}</div>
      </div>
    `)
    .join("");
  
  log(`📋 Rendered ${conversations.length} conversations`, "info");
}

/**
 * Open conversation from clicked element (wrapper function)
 */
function openConversationFromElement(element) {
  const userId = parseInt(element.getAttribute("data-user-id"));
  const userName = element.getAttribute("data-user-name");
  
  log(`🖱️ Clicked conversation: userId=${userId}, userName=${userName}`, "info");
  
  openConversation(userId, userName);
}

/**
 * Admin opens conversation with user
 * @param {number} conversationUserId - User ID from conversation list
 * @param {string} userName - Username
 */
function openConversation(conversationUserId, userName) {
  currentConversationId = conversationUserId;  // User we're chatting with
  
  log(`👤 Mở cuộc trò chuyện với ${userName}`, "info");
  
  // Clear messages container first
  const messagesContainer = document.getElementById("admin-chat-messages");
  if (messagesContainer) {
    messagesContainer.innerHTML = "<p style='text-align: center; color: #999;'>Đang tải tin nhắn...</p>";
  }
  
  if (socket && socket.connected) {
    socket.emit("admin-open-conversation", {
      userId: conversationUserId,  // User ID we want to chat with
      adminId: userId,  // Global userId = current admin ID
      userName: userName,
    });
  } else {
    log("❌ Socket not connected!", "error");
  }
}

/**
 * Admin gửi tin nhắn tới user
 */
function sendAdminMessage() {
  const input = document.getElementById("admin-message-input");
  const message = input.value.trim();
  
  if (!message) return;
  
  if (!currentConversationId) {
    alert("❌ Vui lòng chọn một cuộc trò chuyện!");
    return;
  }
  
  if (!socket || !socket.connected) {
    alert("❌ Mất kết nối tới server!");
    return;
  }
  
  // Send message with receiverId (the user we're replying to)
  socket.emit("send-message", {
    conversationId: currentConversationId,
    senderId: userId,  // Admin ID
    receiverId: currentConversationId,  // User ID (the conversation we opened)
    senderName: "Support Admin",
    message: message,
    timestamp: new Date().toISOString(),
  });
  
  input.value = "";
  input.focus();
  
  log(`💬 Admin gửi tới user ${currentConversationId}: ${message}`, "info");
}

/**
 * Admin request conversation list
 */
function requestConversationList() {
  if (!socket || !socket.connected) {
    alert("❌ Mất kết nối tới server!");
    return;
  }
  
  socket.emit("admin-get-conversations", {
    adminId: userId,
  });
  
  log("📋 Đang lấy danh sách cuộc trò chuyện...", "info");
}

/**
 * Escape HTML để tránh XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
