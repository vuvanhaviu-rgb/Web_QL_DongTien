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
- **Tự điền bảng chi tiêu (mục Khách hàng):** chỉ một lần mỗi ngày, lần đồng bộ đầu tiên từ **10:00 sáng** giờ Việt Nam ghi số chuẩn của hôm qua rồi khóa. Trong ngày, **Tổng quan và link chia sẻ** vẫn hiện số thực kéo từ Facebook (mỗi lần đồng bộ) nhưng số này không được ghi vào bảng chi tiêu của khách.
- Chạy ngay: github.com/vuvanhaviu-rgb/Web_QL_DongTien/actions/workflows/fb-sync.yml → **Run workflow**.

**Lịch chạy định kỳ (khoảng 10–15 phút):** lịch tự động của GitHub hay bị chậm, nên dùng thêm cron-job.org gọi GitHub:
- URL: `https://api.github.com/repos/vuvanhaviu-rgb/Web_QL_DongTien/actions/workflows/fb-sync.yml/dispatches`
- Phương thức POST, body `{"ref":"main"}`
- Headers: `Authorization: Bearer <mã GitHub chỉ có quyền Actions của kho này>`, `Accept: application/vnd.github+json`, `Content-Type: application/json`
- Lịch: mỗi 10 hoặc 15 phút tùy bạn đặt. Kết quả đúng khi Test run báo 204.
- Mã GitHub nằm ở github.com/settings/personal-access-tokens. Nếu lộ mã, bấm **Regenerate token** rồi dán mã mới vào cron-job.org.

**Đổi mã Facebook (`FB_TOKEN`):** Business Settings → Người dùng hệ thống → Tạo mã, tick `ads_read`, `ads_management`, `business_management`. Dán vào GitHub Secrets, ghi đè `FB_TOKEN`. Không gửi mã vào chat hay file công khai.

## 5. Mục Quản lý TKQC Meta
- **Bảng tài khoản quảng cáo:** dư nợ hiện tại và 4 số cuối thẻ lấy tự động từ Facebook. **Ngưỡng thanh toán** và **ngày thanh toán dự kiến** Facebook không trả về, nên bạn tự nhập từ Ads Manager → Thanh toán. Ô nào chưa có dữ liệu hiện "Chưa xác định", web không tự đoán.
- **Cảnh báo:** báo "Sắp chạm ngưỡng" khi còn dưới 20% ngưỡng, "Đã chạm ngưỡng" khi dư nợ ≥ ngưỡng.
- **Ô chỉ số:** Dư nợ hiện tại, Tổng ngưỡng, Số dư ngưỡng còn lại (ngưỡng − dư nợ), Số dư ngân hàng (bạn nhập), Phí thanh toán (dư nợ × 1,1%), Tổng dư nợ khách hàng, và **Số dư thực tế = Số dư ngân hàng − Dư nợ − Phí + Dư nợ khách hàng**.
- **Danh sách công nợ khách:** lấy từ bảng chi tiêu từng khách. Còn nợ = (chi phí quảng cáo + phí dịch vụ) − số khách đã chuyển. **Quá hạn** là khách còn nợ và có dòng chưa thanh toán từ 3 ngày trở lên. Mục **Thống kê** cũng dùng cùng nguồn số liệu này.

## 6. Sao lưu dữ liệu (nên làm mỗi tuần)
- Cột menu trái có khung **Sao lưu dữ liệu**. Bấm **Tải bản sao lưu** để tải file `.json` chứa toàn bộ dữ liệu. Cất ở ít nhất 2 nơi (máy tính và Google Drive hoặc email).
- **Khôi phục:** đăng nhập, vào Cài đặt, bấm **Khôi phục từ file** và chọn file .json gần nhất. Ngay bên dưới hiện khung tóm tắt (file có bao nhiêu khách, dòng chi tiêu...). Bấm **Khôi phục N bản ghi** để ghi vào, hoặc **Hủy** để thôi. Khi xong khung báo kết quả và không tự biến mất. Dữ liệu cùng mã bị ghi đè, dữ liệu thêm sau ngày sao lưu vẫn còn.
- Firebase có thể tự sao lưu hằng ngày (Firestore → Disaster Recovery), nhưng cần nâng gói Blaze và gắn thẻ thanh toán. Nếu dùng, đặt hạn mức chi tiêu thấp.

## 7. Chia sẻ bảng chi tiêu cho khách
Mở bảng chi tiêu của khách → **Tạo link chia sẻ** → **Sao chép** gửi khách. Link chỉ xem, không có phí ngân hàng và phí thực nhận. Muốn thu hồi, bấm **Tắt chia sẻ**.

## 8. Cài thành app trên điện thoại
Mở https://vhagency.io.vn bằng trình duyệt điện thoại → menu trình duyệt → **Thêm vào màn hình chính** (hoặc **Cài đặt ứng dụng**).

## 9. Thẻ Chi Tiêu Gửi Khách (báo cáo gửi Zalo)
1. Vào **Cài đặt** → mục *Thông tin chuyển khoản*: nhập ngân hàng, mã ngân hàng (Techcombank là TCB), số tài khoản, chủ tài khoản và số điện thoại liên hệ. Sửa xong bấm ra ngoài ô để tự lưu.
2. Vào thẻ **Chi Tiêu Gửi Khách**. Phía trên có các nút chọn thời gian: *Hôm nay, Hôm qua, 3 ngày, 7 ngày, 14 ngày, 30 ngày, Tháng này, Năm nay, Ngày khác*. Danh sách bên dưới đánh số thứ tự tất cả khách, khách có chạy quảng cáo trong khoảng đã chọn được xếp lên đầu cùng số chi phí; gõ tên vào ô tìm kiếm để lọc nhanh.
3. Ở cuối mỗi dòng khách có nút **Tạo ảnh báo cáo**. Bấm vào, ảnh báo cáo của khách đó hiện ra bên phải (trên điện thoại hiện cả màn hình, có nút quay lại). Chưa bấm khách nào thì chưa hiện ảnh.
4. Ảnh là hình **vuông**. Bạn chỉ cần **nhấn giữ / bấm chuột phải vào ảnh → Sao chép ảnh** rồi dán vào Zalo gửi khách (không cần tải về).
5. Ảnh tự thay đổi theo khách: shop chỉ chạy bài viết thì chỉ có cột *Bài viết*, shop chỉ chạy Live thì chỉ có cột *Live*, chạy cả hai thì hiện cả hai. Cột *Tổng chi phí* = phí ads + phí dịch vụ theo % riêng của khách.
6. Mã QR được tự tạo ngay trong trang theo chuẩn VietQR, có sẵn số tiền nợ và nội dung `VH <MÃ KHÁCH> <ngàythángnay>` (không cần mạng ngoài). Ngân hàng và số tài khoản lấy ở Cài đặt (mã ngân hàng ngắn như TCB, VCB, MB, ACB, BIDV… hoặc mã BIN 6 số). Chỉ khi không tạo được (ví dụ mã ngân hàng lạ) mới thử tải từ img.vietqr.io, rồi cuối cùng dùng ảnh QR tĩnh (`assets/ma-qr-techcombank.png`, không có sẵn số tiền) kèm cảnh báo vàng.
7. Tổng cần thanh toán bằng số *Còn nợ* ở thẻ Khách hàng. *Số tiền cần chuyển* và mã QR được bỏ 3 số lẻ cuối thành 000 (ví dụ 10.959.022 → 10.959.000). Phần lẻ còn sót dưới 1.000đ sau khi khách chuyển được bỏ luôn, coi như đã thanh toán đủ, không cộng sang kỳ sau. Khách trả một phần thì được trừ vào ngày cũ nhất trước; ngày nào trả đủ thì không hiện. Khách đã trả đủ hiện "Đã thanh toán đủ". Khách chuyển khoản trước còn dư tiền (từ 1.000đ) vẫn tạo được ảnh, trong ảnh hiện chi tiêu quảng cáo của hôm qua, "Số dư còn lại" màu xanh và mã QR (không có sẵn số tiền) để khách chuyển thêm khi cần; danh sách bên trái ghi "Dư ..." cho khách đó.

Khoản nợ lẻ dưới 1.000đ (hoặc dư dưới 1.000đ) được coi là 0 ở mọi nơi: Dư nợ cuối của từng khách, Tổng công nợ, số khách còn nợ, Payment History và ảnh báo cáo. Dữ liệu gốc trong bảng chi tiêu không bị sửa, nên nếu sau này nợ của khách lên từ 1.000đ trở lên thì khoản lẻ đó lại được tính vào.

## 10. Xóa chi tiêu theo tháng
Vào **Cài đặt** → mục *Xóa chi tiêu theo tháng*: chọn tháng, app báo sẽ xóa bao nhiêu dòng của bao nhiêu khách. Bước 1 bấm *Tải bản sao lưu* (bắt buộc, để còn khôi phục), bước 2 bấm *Xóa chi tiêu tháng …* rồi bấm thêm lần nữa để xác nhận (có nút *Hủy*). Chỉ xóa các dòng trong Bảng chi tiêu của tháng đó cho mọi khách; số Spend lấy từ Facebook không bị xóa. Công nợ của khách sẽ tính lại theo số còn lại. Các ngày đã xóa (đến hôm qua) được ghi nhớ để hệ thống không tự điền lại lúc 10h sáng.

## 11. Thu gọn menu bên trái

Trên máy tính, nút **Thu gọn menu** ở đầu cột menu cho phép đóng cột lại để bảng rộng hơn. Bấm nút mũi tên nhỏ để mở lại. Trình duyệt nhớ lựa chọn của bạn. Trên điện thoại menu nằm ở thanh dưới nên không có nút này.

## 12. Tên trên tab trình duyệt

Mỗi thẻ hiện tên riêng trên tab, ví dụ "Tổng quan · VH Agency". Khi mở một khách, tab hiện tên khách đó ("C Châu · Khách hàng · VH Agency"). Địa chỉ trang cũng ghi đúng khách (đuôi `#khach-hang/...`), nên bấm chuột phải mở tab mới hoặc tải lại trang vẫn giữ đúng khách.

## Lưu ý an toàn
- Không bao giờ dán mã `FB_TOKEN`, `FIREBASE_SA` hay mã GitHub vào chat, ảnh chụp màn hình hay file trong kho. Lỡ lộ thì tạo lại mã ngay.
- Gói miễn phí của Firebase và GitHub đủ dùng cho vài chục khách.
