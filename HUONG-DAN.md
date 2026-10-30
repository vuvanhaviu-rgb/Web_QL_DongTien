# Hướng dẫn vận hành web Quản lý dòng tiền (VH Agency)

Web chạy trên 3 dịch vụ miễn phí: **GitHub** (giữ mã web và tự đưa lên mạng), **Firebase** (lưu dữ liệu và đăng nhập), **Facebook Marketing API** (lấy chi phí quảng cáo). Địa chỉ web: https://vhagency.io.vn

## 1. Dữ liệu nằm ở đâu
- **Firebase Firestore (dự án qldt-188a5):** toàn bộ dữ liệu: khách hàng, bảng giá, bảng chi tiêu từng ngày, chi tiêu Facebook, thông tin tài khoản quảng cáo, số dư ngân hàng, ngưỡng và ngày thanh toán bạn nhập. Chỉ tài khoản đăng nhập mới đọc và ghi được.
- **GitHub (kho Web_QL_DongTien):** chỉ chứa mã web, **không chứa dữ liệu kinh doanh**. Hai mã bí mật nằm ở Settings → Secrets and variables → Actions: `FB_TOKEN` (mã Facebook) và `FIREBASE_SA` (khóa ghi vào Firebase).
- **Máy của bạn:** file sao lưu bạn tải về (mục 6).

## 2. Cập nhật web
Mọi thay đổi trên kho GitHub (nhánh main) tự đưa lên mạng sau khoảng 1 phút (workflow "Deploy UI to GitHub Pages"). Sau đó nhấn **Ctrl + Shift + R** để tải bản mới. Trên điện thoại, đóng hẳn app rồi mở lại.

## 3. Đăng nhập và luật bảo mật Firebase
- Tài khoản đăng nhập: Firebase → Authentication → Users → Add user (email + mật khẩu).
- Luật Firestore (Firestore Database → Rules → Publish):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shares/{token} {
      allow get: if true;
      allow write: if request.auth != null;
    }
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
Đoạn `shares` cho phép người ngoài xem đúng một bảng chi tiêu khi có link chia sẻ. Không xem được dữ liệu khác.

## 4. Lấy chi phí từ Facebook
**Cách hoạt động:** workflow "Kéo chi phí Facebook" chạy `scripts/fb-sync.js`, đọc chi phí các chiến dịch và ghi vào Firebase.
- Nhập **ID tài khoản quảng cáo** cho từng khách ở mục Khách hàng (một khách có thể có nhiều ID, cách nhau bằng dấu phẩy).
- **Tách chi phí theo khách:** khi một tài khoản chạy cho nhiều khách, web nhận chiến dịch có tên trùng đúng tên khách. Chiến dịch không trùng tên thì tính theo **từ khóa Live / Bài viết** điền trong form khách hàng.
- **Tự điền bảng chi tiêu:** dòng hôm nay cập nhật mỗi lần đồng bộ. Dòng hôm qua được chốt một lần từ **10:00 sáng** giờ Việt Nam.
- Chạy ngay: github.com/vuvanhaviu-rgb/Web_QL_DongTien/actions/workflows/fb-sync.yml → **Run workflow**.

**Lịch chạy mỗi 30 phút:** lịch tự động của GitHub hay bị chậm, nên dùng thêm cron-job.org gọi GitHub:
- URL: `https://api.github.com/repos/vuvanhaviu-rgb/Web_QL_DongTien/actions/workflows/fb-sync.yml/dispatches`
- Phương thức POST, body `{"ref":"main"}`
- Headers: `Authorization: Bearer <mã GitHub chỉ có quyền Actions của kho này>`, `Accept: application/vnd.github+json`, `Content-Type: application/json`
- Lịch: mỗi 30 phút. Kết quả đúng khi Test run báo 204.
- Mã GitHub nằm ở github.com/settings/personal-access-tokens. Nếu lộ mã, bấm **Regenerate token** rồi dán mã mới vào cron-job.org.

**Đổi mã Facebook (`FB_TOKEN`):** Business Settings → Người dùng hệ thống → Tạo mã, tick `ads_read`, `ads_management`, `business_management`. Dán vào GitHub Secrets, ghi đè `FB_TOKEN`. Không gửi mã vào chat hay file công khai.

**Nút Làm mới ở mục Spend hiện tại (kéo chi phí ngay, khoảng 30 giây):** là một hàm Firebase (thư mục `functions/`, vùng asia-southeast1) chạy cùng lõi đồng bộ với GitHub (`functions/sync.js`). Cài một lần trên máy tính có Node.js:
1. Tải mã nguồn (GitHub → Code → Download ZIP), mở cửa sổ lệnh trong thư mục đó.
2. `npm install -g firebase-tools`, rồi `firebase login` (đăng nhập đúng Gmail chủ dự án qldt-188a5).
3. `cd functions`, `npm install`, `cd ..`
4. `firebase functions:secrets:set FB_TOKEN --project qldt-188a5`, dán mã Facebook khi được hỏi (mã không hiện lên màn hình).
5. `firebase deploy --only functions --project qldt-188a5` (cần gói Blaze; nếu hỏi số ngày giữ bản cài cũ thì gõ 1).
Khi đổi mã Facebook, nhớ cập nhật cả GitHub Secrets (`FB_TOKEN`) và Firebase (`firebase functions:secrets:set FB_TOKEN`, rồi deploy lại).
Chưa cài hàm này thì nút Làm mới chỉ làm mới số liệu đang hiển thị; số mới vẫn về theo lịch 30 phút.

## 5. Mục Quản Lý TKQC META
- **Bảng tài khoản quảng cáo:** dư nợ hiện tại và 4 số cuối thẻ lấy tự động từ Facebook. **Ngưỡng thanh toán** và **ngày thanh toán dự kiến** Facebook không trả về, nên bạn tự nhập từ Ads Manager → Thanh toán. Ô nào chưa có dữ liệu hiện "Chưa xác định", web không tự đoán.
- **Cảnh báo:** báo "Sắp chạm ngưỡng" khi còn dưới 20% ngưỡng, "Đã chạm ngưỡng" khi dư nợ ≥ ngưỡng.
- **Ô chỉ số:** Dư nợ hiện tại, Tổng ngưỡng, Số dư ngưỡng còn lại (ngưỡng − dư nợ), Số dư ngân hàng (bạn nhập), Phí thanh toán (dư nợ × 1,1%), Tổng dư nợ khách hàng, và **Số dư thực tế = Số dư ngân hàng − Dư nợ − Phí + Dư nợ khách hàng**.
- **Danh sách công nợ khách:** lấy từ bảng chi tiêu từng khách. Còn nợ = (chi phí quảng cáo + phí dịch vụ) − số khách đã chuyển. **Quá hạn** là khách còn nợ và có dòng chưa thanh toán từ 3 ngày trở lên. Mục **Thống kê** cũng dùng cùng nguồn số liệu này.

## 6. Sao lưu dữ liệu (nên làm mỗi tuần)
- Cột menu trái có khung **Sao lưu dữ liệu**. Bấm **Tải bản sao lưu** để tải file `.json` chứa toàn bộ dữ liệu. Cất ở ít nhất 2 nơi (máy tính và Google Drive hoặc email).
- **Khôi phục:** đăng nhập, bấm **Khôi phục từ file**, chọn file gần nhất, bấm OK. Dữ liệu cùng mã bị ghi đè, dữ liệu thêm sau ngày sao lưu vẫn còn.
- Firebase có thể tự sao lưu hằng ngày (Firestore → Disaster Recovery), nhưng cần nâng gói Blaze và gắn thẻ thanh toán. Nếu dùng, đặt hạn mức chi tiêu thấp.

## 7. Chia sẻ bảng chi tiêu cho khách
Mở bảng chi tiêu của khách → **Tạo link chia sẻ** → **Sao chép** gửi khách. Link chỉ xem, không có phí ngân hàng và phí thực nhận. Muốn thu hồi, bấm **Tắt chia sẻ**.

## 8. Cài thành app trên điện thoại
Mở https://vhagency.io.vn bằng trình duyệt điện thoại → menu trình duyệt → **Thêm vào màn hình chính** (hoặc **Cài đặt ứng dụng**).

## Lưu ý an toàn
- Không bao giờ dán mã `FB_TOKEN`, `FIREBASE_SA` hay mã GitHub vào chat, ảnh chụp màn hình hay file trong kho. Lỡ lộ thì tạo lại mã ngay.
- Gói miễn phí của Firebase và GitHub đủ dùng cho vài chục khách.
