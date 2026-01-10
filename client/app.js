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

const API_BASE = 'http://localhost:3000/api';

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  log('🌐 Client khởi động', 'info');
  
  // Kiểm tra token đã lưu
  authToken = localStorage.getItem('authToken');
  
  if (authToken) {
    // Auto-login nếu đã có token
    restoreSession();
  } else {
    // Hiển thị auth form
    document.getElementById('auth-section').style.display = 'block';
  }
});

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Register user mới
 */
async function register() {
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  if (!username || !email || !password) {
    alert('Vui lòng nhập đầy đủ thông tin');
    return;
  }

  try {
    log('📡 HTTP POST /api/auth/register - Đăng ký tài khoản', 'info');

    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const result = await response.json();

    if (result.success) {
      authToken = result.data.token;
      const user = result.data.user;
      loginSuccess(user, authToken);
      log(`✅ Đăng ký thành công! Xin chào ${user.username}`, 'success');
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi đăng ký: ${error.message}`, 'error');
  }
}

/**
 * Login user
 */
async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    alert('Vui lòng nhập tên đăng nhập và mật khẩu');
    return;
  }

  try {
    log('📡 HTTP POST /api/auth/login - Đăng nhập', 'info');

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();

    if (result.success) {
      const user = result.data.user;
      authToken = result.data.token;
      loginSuccess(user, authToken);
      log(`✅ Đăng nhập thành công! Xin chào ${user.username}`, 'success');
    } else {
      alert(`❌ ${result.message}`);
      log(`❌ Đăng nhập thất bại`, 'error');
    }
  } catch (error) {
    log(`❌ Lỗi đăng nhập: ${error.message}`, 'error');
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
  localStorage.setItem('authToken', token);

  // Update UI
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('user-section').style.display = 'block';
  document.getElementById('display-username').textContent = userName;
  document.getElementById('display-role').textContent = userRole === 'admin' ? '👨‍💼 Admin' : '👤 Người dùng';

  // Hiển thị upload form nếu là admin
  if (userRole === 'admin') {
    document.getElementById('admin-section').style.display = 'block';
  }

  // Kết nối WebSocket và load movies
  initializeWebSocket();
  loadMovies();
}

/**
 * Restore session từ token
 */
async function restoreSession() {
  try {
    log('📡 HTTP GET /api/auth/me - Kiểm tra token', 'info');

    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.ok) {
      const result = await response.json();
      const user = result.data;
      userId = user.id;
      userName = user.username;
      userRole = user.role;

      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('user-section').style.display = 'block';
      document.getElementById('display-username').textContent = userName;
      document.getElementById('display-role').textContent = userRole === 'admin' ? '👨‍💼 Admin' : '👤 Người dùng';

      if (userRole === 'admin') {
        document.getElementById('admin-section').style.display = 'block';
      }

      initializeWebSocket();
      loadMovies();
      log(`✅ Tự động đăng nhập thành công!`, 'success');
    } else {
      // Token không hợp lệ
      localStorage.removeItem('authToken');
      authToken = null;
      document.getElementById('auth-section').style.display = 'block';
    }
  } catch (error) {
    log(`⚠️ Lỗi restore session: ${error.message}`, 'error');
    localStorage.removeItem('authToken');
    authToken = null;
  }
}

/**
 * Logout
 */
function logout() {
  localStorage.removeItem('authToken');
  authToken = null;
  userId = null;
  userName = null;
  userRole = null;

  if (socket) {
    socket.disconnect();
  }

  document.getElementById('user-section').style.display = 'none';
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('movies-section').style.display = 'none';
  document.getElementById('seats-section').style.display = 'none';
  document.getElementById('auth-section').style.display = 'block';

  // Reset form
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('register-username').value = '';
  document.getElementById('register-email').value = '';
  document.getElementById('register-password').value = '';

  log('👋 Đã đăng xuất', 'info');
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function initializeWebSocket() {
  log('🔌 Đang kết nối WebSocket...', 'info');

  socket = io('http://localhost:3000', {
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    log('✅ WebSocket đã kết nối thành công!', 'success');
    updateConnectionStatus(true);
  });

  socket.on('disconnect', () => {
    log('❌ WebSocket ngắt kết nối', 'error');
    updateConnectionStatus(false);
  });

  socket.on('connect_error', (error) => {
    log(`⚠️ Lỗi kết nối: ${error.message}`, 'error');
    updateConnectionStatus(false);
  });

  // Real-time events
  socket.on('seats-updated', (data) => {
    log(`🔄 Nhận cập nhật ghế real-time cho phim ${data.movieId}`, 'info');
    if (data.movieId === currentMovieId) {
      renderSeats(data.seats);
    }
  });

  socket.on('new-movie', (data) => {
    log(`🎬 ${data.message}`, 'success');
    loadMovies();
  });

  socket.on('user-joined', (data) => {
    log(`👋 ${data.message}`, 'info');
  });

  socket.on('user-left', (data) => {
    log(`👋 ${data.message}`, 'info');
  });

  socket.on('seat-error', (data) => {
    log(`⚠️ ${data.message}`, 'error');
    alert(data.message);
  });

  // Ping-pong
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('ping');
    }
  }, 30000);
}

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');

  if (connected) {
    indicator.textContent = '🟢';
    text.textContent = 'Đã kết nối';
  } else {
    indicator.textContent = '🔴';
    text.textContent = 'Mất kết nối';
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
    log('📡 HTTP GET /api/movies - Lấy danh sách phim', 'info');

    const response = await fetch(`${API_BASE}/movies`);
    const result = await response.json();

    if (result.success) {
      movies = result.data;
      renderMovies(movies);
      document.getElementById('movies-section').style.display = 'block';
      log(`✅ Đã tải ${movies.length} phim`, 'success');
    }
  } catch (error) {
    log(`❌ Lỗi khi tải phim: ${error.message}`, 'error');
  }
}

/**
 * Chọn phim
 */
function selectMovie(movieId) {
  currentMovieId = movieId;
  const movie = movies.find(m => m.id === movieId);

  if (!movie) return;

  log(`🎬 Chọn phim: ${movie.title}`, 'info');

  currentMoviePrice = movie.price;

  document.getElementById('selected-movie-title').textContent = movie.title;
  document.getElementById('selected-movie-info').textContent =
    `${movie.time} | ${movie.date} | ${movie.theater} | ${movie.price.toLocaleString()} VNĐ`;

  document.getElementById('movies-section').style.display = 'none';
  document.getElementById('seats-section').style.display = 'block';

  // Join movie room
  socket.emit('join-movie', {
    movieId: currentMovieId,
    userId: userId,
    userName: userName
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
  const container = document.getElementById('seats-container');
  container.innerHTML = '';

  const seatsByRow = {};
  seats.forEach(seat => {
    const row = seat.seat_id[0];
    if (!seatsByRow[row]) {
      seatsByRow[row] = [];
    }
    seatsByRow[row].push(seat);
  });

  Object.keys(seatsByRow)
    .sort()
    .forEach(row => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'seat-row';

      seatsByRow[row]
        .sort((a, b) => parseInt(a.seat_id.slice(1)) - parseInt(b.seat_id.slice(1)))
        .forEach(seat => {
          const seatBtn = document.createElement('button');
          seatBtn.className = `seat-btn seat-${seat.status}`;
          seatBtn.textContent = seat.seat_id;

          if (seat.status === 'available' || (seat.status === 'selected' && seat.user_id === userId)) {
            seatBtn.onclick = () => toggleSeat(seat.seat_id, seat.status);
          }

          if (seat.status === 'selected' && seat.user_id === userId) {
            seatBtn.classList.add('selected');
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
  if (status === 'booked') return;

  if (selectedSeats.has(seatId)) {
    selectedSeats.delete(seatId);
    socket.emit('unselect-seat', {
      movieId: currentMovieId,
      seatId: seatId,
      userId: userId
    });
  } else {
    selectedSeats.add(seatId);
    socket.emit('select-seat', {
      movieId: currentMovieId,
      seatId: seatId,
      userId: userId
    });
  }

  updatePrice();
}

/**
 * Cập nhật giá tiền
 */
function updatePrice() {
  const totalPrice = currentMoviePrice * selectedSeats.size;
  document.getElementById('total-price').textContent = totalPrice.toLocaleString() + ' VNĐ';
  document.getElementById('selected-count').textContent = selectedSeats.size;
}

/**
 * Confirm booking
 */
async function confirmBooking() {
  if (selectedSeats.size === 0) {
    alert('Vui lòng chọn ít nhất 1 ghế');
    return;
  }

  try {
    log('📡 HTTP POST /api/bookings - Xác nhận đặt vé', 'info');

    const response = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        movieId: currentMovieId,
        seats: Array.from(selectedSeats)
      })
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Booking thành công!\nMã booking: ${result.data.bookingId}\nTổng tiền: ${result.data.totalPrice.toLocaleString()} VNĐ`);
      log(`✅ Booking thành công!`, 'success');

      selectedSeats.clear();
      goBackToMovies();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi booking: ${error.message}`, 'error');
    alert(`Lỗi: ${error.message}`);
  }
}

/**
 * Quay lại danh sách phim
 */
function goBackToMovies() {
  currentMovieId = null;
  selectedSeats.clear();
  document.getElementById('seats-section').style.display = 'none';
  document.getElementById('movies-section').style.display = 'block';
}

// ============================================
// ADMIN - UPLOAD FILM
// ============================================

/**
 * Upload phim mới (Admin only)
 */
async function uploadMovie() {
  const title = document.getElementById('upload-title').value.trim();
  const description = document.getElementById('upload-description').value.trim();
  const time = document.getElementById('upload-time').value;
  const date = document.getElementById('upload-date').value;
  const theater = document.getElementById('upload-theater').value.trim();
  const price = document.getElementById('upload-price').value;
  const posterFile = document.getElementById('upload-poster').files[0];

  if (!title || !time || !date || !theater || !price) {
    alert('Vui lòng nhập đầy đủ thông tin phim');
    return;
  }

  try {
    log('📡 HTTP POST /api/admin/movies - Upload phim', 'info');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('time', time);
    formData.append('date', date);
    formData.append('theater', theater);
    formData.append('price', price);
    if (posterFile) {
      formData.append('poster', posterFile);
    }

    const response = await fetch(`${API_BASE}/admin/movies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Upload phim thành công!\nPhim: ${result.data.title}`);
      log(`✅ Upload phim thành công!`, 'success');

      // Reset form
      document.getElementById('upload-title').value = '';
      document.getElementById('upload-description').value = '';
      document.getElementById('upload-time').value = '';
      document.getElementById('upload-date').value = '';
      document.getElementById('upload-theater').value = '';
      document.getElementById('upload-price').value = '';
      document.getElementById('upload-poster').value = '';

      // Reload movies
      loadMovies();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi upload: ${error.message}`, 'error');
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
  const container = document.getElementById('movies-list');
  container.innerHTML = '';

  movieList.forEach(movie => {
    const div = document.createElement('div');
    div.className = 'movie-card';
    div.innerHTML = `
      <div class="movie-poster" style="background-image: url('${movie.poster_url || 'https://via.placeholder.com/200x300?text=No+Poster'}')"></div>
      <h3>${movie.title}</h3>
      <p class="movie-info">${movie.time} | ${movie.date}</p>
      <p class="movie-info">${movie.theater}</p>
      <p class="movie-price">${movie.price.toLocaleString()} VNĐ</p>
      <button onclick="selectMovie(${movie.id})" class="btn-primary">Đặt vé</button>
    `;
    container.appendChild(div);
  });
}

/**
 * Logging utility
 */
function log(message, type = 'info') {
  const logContainer = document.getElementById('logs');
  const logEntry = document.createElement('div');
  logEntry.className = `log-${type}`;
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // Giữ tối đa 100 log entries
  while (logContainer.children.length > 100) {
    logContainer.removeChild(logContainer.firstChild);
  }
}
