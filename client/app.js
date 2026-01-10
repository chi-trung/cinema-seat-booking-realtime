/**
 * CINEMA REALTIME BOOKING - CLIENT-SIDE APPLICATION
 * 
 * Tương tác với server qua:
 * 1. HTTP REST API: Fetch data, submit bookings
 * 2. WebSocket: Real-time seat updates
 */

// ============================================
// GLOBAL STATE
// ============================================

let socket = null;
let userId = null;
let userName = null;
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
  // Không auto-connect socket, đợi user nhập tên
});

// ============================================
// USER MANAGEMENT
// ============================================

function setUser() {
  const nameInput = document.getElementById('user-name');
  userName = nameInput.value.trim();
  
  if (!userName) {
    alert('Vui lòng nhập tên!');
    return;
  }
  
  // Generate unique user ID
  userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Update UI
  document.getElementById('user-form').style.display = 'none';
  document.getElementById('user-info').style.display = 'block';
  document.getElementById('display-name').textContent = userName;
  document.getElementById('display-id').textContent = userId;
  
  log(`👤 User đăng nhập: ${userName} (${userId})`, 'success');
  
  // Kết nối WebSocket và load movies
  initializeWebSocket();
  loadMovies();
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function initializeWebSocket() {
  log('🔌 Đang kết nối WebSocket...', 'info');
  
  // Khởi tạo Socket.IO connection
  socket = io('http://localhost:3000', {
    transports: ['websocket', 'polling']
  });
  
  // Connection events
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
  
  // Real-time events from server
  
  // Cập nhật trạng thái ghế (REAL-TIME SYNC)
  socket.on('seats-updated', (data) => {
    log(`🔄 Nhận cập nhật ghế real-time cho phim ${data.movieId}`, 'info');
    if (data.movieId === currentMovieId) {
      renderSeats(data.seats);
    }
  });
  
  // User join notification
  socket.on('user-joined', (data) => {
    log(`👋 ${data.message}`, 'info');
  });
  
  // User left notification
  socket.on('user-left', (data) => {
    log(`👋 ${data.message}`, 'info');
  });
  
  // Seat error
  socket.on('seat-error', (data) => {
    log(`⚠️ ${data.message}`, 'error');
    alert(data.message);
  });
  
  // Ping-pong for connection health
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('ping');
    }
  }, 30000);
  
  socket.on('pong', () => {
    // Connection is healthy
  });
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
 * Load danh sách phim qua REST API
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
 * Chọn phim và load ghế
 */
async function selectMovie(movieId) {
  currentMovieId = movieId;
  const movie = movies.find(m => m.id === movieId);
  
  if (!movie) return;
  
  log(`🎬 Chọn phim: ${movie.title}`, 'info');
  
  currentMoviePrice = movie.price;
  
  // Update UI
  document.getElementById('selected-movie-title').textContent = movie.title;
  document.getElementById('selected-movie-info').textContent = 
    `${movie.time} | ${movie.date} | ${movie.theater} | ${movie.price.toLocaleString()} VNĐ`;
  
  document.getElementById('movies-section').style.display = 'none';
  document.getElementById('seats-section').style.display = 'block';
  
  // Join movie room qua WebSocket
  socket.emit('join-movie', {
    movieId: currentMovieId,
    userId: userId
  });
  
  // Load ghế qua REST API
  try {
    log(`📡 HTTP GET /api/movies/${movieId}/seats - Lấy trạng thái ghế`, 'info');
    
    const response = await fetch(`${API_BASE}/movies/${movieId}/seats`);
    const result = await response.json();
    
    if (result.success) {
      renderSeats(result.data);
    }
  } catch (error) {
    log(`❌ Lỗi khi tải ghế: ${error.message}`, 'error');
  }
}

function backToMovies() {
  // Unselect all seats
  selectedSeats.forEach(seatId => {
    socket.emit('unselect-seat', {
      movieId: currentMovieId,
      seatId: seatId,
      userId: userId
    });
  });
  
  selectedSeats.clear();
  currentMovieId = null;
  
  document.getElementById('seats-section').style.display = 'none';
  document.getElementById('movies-section').style.display = 'block';
  document.getElementById('booking-summary').style.display = 'none';
}

// ============================================
// SEAT MANAGEMENT
// ============================================

function renderMovies(moviesList) {
  const container = document.getElementById('movies-list');
  container.innerHTML = '';
  
  moviesList.forEach(movie => {
    const movieCard = document.createElement('div');
    movieCard.className = 'movie-card';
    movieCard.innerHTML = `
      <h3>${movie.title}</h3>
      <p>🕒 ${movie.time}</p>
      <p>📅 ${movie.date}</p>
      <p>🎭 ${movie.theater}</p>
      <p class="price">💰 ${movie.price.toLocaleString()} VNĐ</p>
      <button onclick="selectMovie(${movie.id})" class="btn-primary">Chọn phim</button>
    `;
    container.appendChild(movieCard);
  });
}

function renderSeats(seatsData) {
  const container = document.getElementById('seats-grid');
  container.innerHTML = '';
  
  // Tạo lưới ghế 10x10
  for (let row = 1; row <= 10; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'seat-row';
    
    // Label hàng
    const rowLabel = document.createElement('div');
    rowLabel.className = 'row-label';
    rowLabel.textContent = String.fromCharCode(64 + row);
    rowDiv.appendChild(rowLabel);
    
    for (let col = 1; col <= 10; col++) {
      const seatId = `${String.fromCharCode(64 + row)}${col}`;
      const seatInfo = seatsData[seatId];
      
      const seatDiv = document.createElement('div');
      seatDiv.className = 'seat';
      seatDiv.dataset.seatId = seatId;
      seatDiv.textContent = col;
      
      // Xác định trạng thái ghế
      if (seatInfo.status === 'booked') {
        seatDiv.classList.add('booked');
      } else if (seatInfo.status === 'selected') {
        if (seatInfo.userId === userId) {
          seatDiv.classList.add('selected');
        } else {
          seatDiv.classList.add('selected-other');
        }
      } else {
        seatDiv.classList.add('available');
        seatDiv.onclick = () => toggleSeat(seatId);
      }
      
      rowDiv.appendChild(seatDiv);
    }
    
    container.appendChild(rowDiv);
  }
}

function toggleSeat(seatId) {
  if (selectedSeats.has(seatId)) {
    // Unselect
    selectedSeats.delete(seatId);
    socket.emit('unselect-seat', {
      movieId: currentMovieId,
      seatId: seatId,
      userId: userId
    });
    log(`🚫 Hủy chọn ghế ${seatId}`, 'info');
  } else {
    // Select
    selectedSeats.add(seatId);
    socket.emit('select-seat', {
      movieId: currentMovieId,
      seatId: seatId,
      userId: userId
    });
    log(`✅ Chọn ghế ${seatId}`, 'success');
  }
  
  updateBookingSummary();
}

function updateBookingSummary() {
  if (selectedSeats.size > 0) {
    const seatsList = Array.from(selectedSeats).join(', ');
    const total = selectedSeats.size * currentMoviePrice;
    
    document.getElementById('selected-seats-list').textContent = seatsList;
    document.getElementById('total-price').textContent = total.toLocaleString();
    document.getElementById('booking-summary').style.display = 'block';
  } else {
    document.getElementById('booking-summary').style.display = 'none';
  }
}

/**
 * Xác nhận đặt vé qua REST API
 */
async function confirmBooking() {
  if (selectedSeats.size === 0) {
    alert('Vui lòng chọn ít nhất 1 ghế!');
    return;
  }
  
  try {
    log(`📡 HTTP POST /api/bookings - Xác nhận đặt ${selectedSeats.size} ghế`, 'info');
    
    const response = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        movieId: currentMovieId,
        seats: Array.from(selectedSeats),
        userId: userId,
        userName: userName
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      log(`✅ Đặt vé thành công! Booking ID: ${result.data.id}`, 'success');
      alert(`Đặt vé thành công!\n\nPhim: ${result.data.movie.title}\nGhế: ${result.data.seats.join(', ')}\nTổng: ${(selectedSeats.size * currentMoviePrice).toLocaleString()} VNĐ`);
      
      selectedSeats.clear();
      backToMovies();
    } else {
      log(`❌ Đặt vé thất bại: ${result.message}`, 'error');
      alert(`Đặt vé thất bại: ${result.message}`);
    }
  } catch (error) {
    log(`❌ Lỗi khi đặt vé: ${error.message}`, 'error');
    alert('Có lỗi xảy ra khi đặt vé!');
  }
}

// ============================================
// ACTIVITY LOG
// ============================================

function log(message, type = 'info') {
  const logContainer = document.getElementById('activity-log');
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
  
  logContainer.insertBefore(logEntry, logContainer.firstChild);
  
  // Keep only last 50 logs
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
  
  // Console log
  console.log(`[${timestamp}] ${message}`);
}
