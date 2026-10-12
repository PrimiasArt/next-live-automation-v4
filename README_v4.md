# 🚀 Next Live Automation v4 - Cloud SaaS & Multi-Tenant Broadcast Engine

Hệ thống phát sóng livestream tự động hóa **100% trên Cloud**, giải phóng hoàn toàn gánh nặng cho máy tính cá nhân yếu và khắc phục triệt để tình trạng mạng gia đình chập chờn. Hỗ trợ **phân quyền đa khách hàng (Multi-Tenant)** với kho video và luồng live hoàn toàn độc lập.

---

## 🌟 Tính Năng Nổi Bật của Phiên Bản v4

### 1. 🛡️ Phân Quyền & Quản Lý Bằng API Key Đơn Giản (API Key Multi-Tenancy)
- **Đăng nhập siêu tốc bằng 1 ô API Key duy nhất**: Không cần tên đăng nhập hay mật khẩu rườm rà.
- **Master Admin API Key**: 1 mã API Key tối cao dành cho bạn (`HLC_ADMIN_MASTER_2026`):
  - Toàn quyền tạo và cấp mã API Key mới cho từng khách hàng chỉ với 1 click.
  - Phân bổ số luồng live tối đa (Stream Quota) và dung lượng ổ cứng (Disk Quota) cho từng khách.
  - Giám sát CPU, RAM, Disk của VPS thời gian thực.
  - Dừng khẩn cấp bất kỳ luồng live nào trên toàn server.
- **Client API Key (Mỗi khách 1 Key)**:
  - Khách hàng chỉ cần dán mã API Key được cấp vào web để kích hoạt không gian riêng.
  - Dữ liệu hoàn toàn độc lập 100%: Khách A không bao giờ nhìn thấy hoặc can thiệp vào video, stream key hay luồng phát của Khách B.

### 2. ⚡ Động Cơ Stream Copy Siêu Nhẹ (Direct Pass-Through)
- Sử dụng công nghệ **Direct Stream Copy**: Đọc trực tiếp file MP4/MKV và đẩy gói tin lên RTMP mà **không giải mã/nén lại video**.
- **Chỉ tốn ~1% - 2% CPU mỗi luồng**:
  - 1 máy chủ VPS giá rẻ (~$6/tháng) có thể gánh mượt mà **15 - 30 luồng live cùng lúc**.
  - Không lo nóng máy, không bị drop fps, máy chủ chạy 24/7 cực mát.
- **Hỗ trợ chế độ Chuyển mã (Transcode x264)**: Tự động tối ưu độ phân giải Full HD / 720p khi video nguồn quá nặng.

### 3. 📁 Kho Video Cloud Riêng Biệt (Media Manager)
- Kéo thả / tải video trực tiếp từ máy tính lên Cloud Server qua trình duyệt Web.
- Tự động kiểm tra dung lượng còn lại của từng khách.
- Nút bấm **"🚀 Phát Live Ngay"** tự động gán video vào luồng chỉ trong 1 click.

### 4. 🌐 Truy Cập Mọi Nơi - Không Cần Cài OBS Lên Máy
- Người dùng chỉ cần mở trình duyệt web trên bất kỳ thiết bị nào (Laptop cũ, PC văn phòng, iPad, điện thoại Android/iOS) để điều khiển.
- Tự động tích hợp Cloudflare Tunnel cấp link HTTPS truy cập toàn cầu miễn phí.

---

## 💻 Hướng Dẫn Chạy Thử Trên Máy Tính (Local Windows)

1. Mở thư mục `F:\SJ\Next Live Automation v4`.
2. Chạy file batch:
   ```cmd
   CHAY_LIVE.bat
   ```
   *(hoặc chạy lệnh: `python run.py`)*
3. Mở trình duyệt truy cập: `http://localhost:5000`
4. Dán **Master Admin API Key** vào ô đăng nhập:
   - **Key**: `HLC_ADMIN_MASTER_2026`
   *(Hoặc dán key khách demo: `HLC_DEMO_CLIENT_KEY`)*

---

## ☁️ Hướng Dẫn Triển Khai 1-Chạm Lên Cloud VPS (Ubuntu Linux)

Khi bạn thuê VPS (Contabo, Hetzner, Vietnix... chạy Ubuntu 22.04 / 24.04), bạn chỉ cần làm theo 2 bước:

### Bước 1: Tải mã nguồn lên VPS
```bash
git clone https://github.com/PrimiasArt/next-live-automation-v4.git /opt/next-live-v4
cd /opt/next-live-v4
```

### Bước 2: Chạy Script Cài Đặt Tự Động
```bash
sudo bash install_cloud.sh
```

Script sẽ tự động:
- Cài đặt Docker & Docker Compose & FFmpeg.
- Build container và thiết lập chế độ tự động khởi chạy cùng VPS (Auto-restart on reboot).
- Cấp quyền lưu trữ cho kho video của khách hàng.
- In ra link web và tài khoản Admin để bạn đăng nhập ngay!

---

## 📊 Cấu Trúc Thư Mục v4

```
F:\SJ\Next Live Automation v4\
├── core\
│   ├── auth_manager.py          # Hệ thống xác thực & bảo mật người dùng
│   ├── cloud_stream_engine.py   # Động cơ live stream Direct Copy & Transcode
│   ├── media_manager.py         # Quản lý kho video và quota ổ đĩa theo khách
│   ├── system_monitor.py        # Giám sát tài nguyên CPU, RAM, Disk server
│   ├── obs_engine.py            # Động cơ Stream Processor studio
│   └── ...
├── web\
│   ├── routes\
│   │   ├── auth_routes.py       # API đăng nhập / xác thực
│   │   ├── admin_routes.py      # API quản trị khách hàng & server
│   │   ├── media_routes.py      # API upload & quản lý video
│   │   ├── cloud_stream_routes.py # API điều khiển luồng live
│   │   └── ...
│   ├── static\
│   │   └── v4_app.js            # Controller giao diện v4 Cloud SaaS
│   └── templates\
│       └── index.html           # Giao diện Web Glassmorphism 4 Tabs
├── storage\
│   └── users\                   # Thư mục chứa video & config riêng của từng khách
├── data\
│   ├── users.json               # Cơ sở dữ liệu tài khoản
│   └── tokens.json              # Phiên đăng nhập bảo mật
├── Dockerfile                   # Cấu hình đóng gói Container Cloud
├── docker-compose.yml           # Khởi chạy dịch vụ bền vững
├── install_cloud.sh             # Script cài đặt 1-chạm cho Linux VPS
└── run.py                       # Điểm khởi chạy chính của hệ thống
```

---

*Hệ thống được phát triển và tối ưu bởi HLC Automation Team &copy; 2026.*
