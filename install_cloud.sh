#!/bin/bash
# ==============================================================================
# Script Cài Đặt 1-Chạm Next Live Automation v4 trên Linux Cloud VPS
# Tác giả: HLC Automation Team
# ==============================================================================

set -e

echo "======================================================================"
echo "🚀 ĐANG TIẾN HÀNH CÀI ĐẶT NEXT LIVE AUTOMATION V4 CLOUD SAAS..."
echo "======================================================================"

# 1. Kiểm tra quyền root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Vui lòng chạy script này với quyền root (sudo bash install_cloud.sh)"
  exit 1
fi

# 2. Cập nhật hệ thống và cài đặt Docker nếu chưa có
if ! command -v docker &> /dev/null; then
    echo "📦 Đang cài đặt Docker và Docker Compose..."
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# 3. Tạo các thư mục dữ liệu lưu trữ
echo "📁 Chuẩn bị thư mục lưu trữ cho khách hàng..."
mkdir -p storage/users data

# 4. Khởi chạy Docker Container
echo "🐳 Đang build và khởi động Next Live Automation v4 Container..."
docker compose down || true
docker compose up -d --build

SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "======================================================================"
echo "🎉 CÀI ĐẶT THÀNH CÔNG HỆ THỐNG NEXT LIVE AUTOMATION V4!"
echo "======================================================================"
echo "🌐 Link truy cập trực tiếp: http://${SERVER_IP}:5000"
echo "🔑 Tài khoản Admin mặc định:"
echo "   - Tên đăng nhập: admin"
echo "   - Mật khẩu:      admin@2026"
echo "======================================================================"
echo "💡 Bạn có thể đăng nhập ngay và tạo tài khoản cho các khách hàng của mình."
echo "======================================================================"
