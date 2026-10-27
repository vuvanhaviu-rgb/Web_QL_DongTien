# Hướng dẫn đưa web Quản lý dòng tiền lên mạng (làm 1 lần, khoảng 20–30 phút)

Bạn cần 2 dịch vụ miễn phí: **Firebase** (lưu dữ liệu + đăng nhập) và **Netlify** (đặt web lên mạng). Tên miền riêng (ten-ban.com) mua thêm, khoảng 250–400 nghìn đồng/năm.

## Bước 1. Tạo nơi lưu dữ liệu (Firebase)
1. Vào https://console.firebase.google.com, đăng nhập bằng Gmail.
2. Bấm **Create a project** (Tạo dự án), đặt tên bất kỳ (vd: quanlydongtien). Tắt Google Analytics, bấm Create.
3. Menu trái: **Build → Firestore Database → Create database**. Chọn vị trí **asia-southeast1 (Singapore)**, chọn **Production mode**, bấm Enable.
4. Menu trái: **Build → Authentication → Get started → Email/Password → bật Enable → Save**.
5. Vẫn ở Authentication, tab **Users → Add user**: nhập email và mật khẩu của bạn. Đây là tài khoản để đăng nhập vào web. Muốn thêm người khác, thêm tương tự.

## Bước 2. Khóa dữ liệu, chỉ người đăng nhập mới xem được
1. Vào **Firestore Database → tab Rules**.
2. Xóa hết nội dung cũ, dán nguyên đoạn này rồi bấm **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Bước 3. Lấy thông tin kết nối dán vào web
1. Bấm biểu tượng bánh răng (góc trên trái) → **Project settings**.
2. Kéo xuống mục **Your apps**, bấm biểu tượng **</>** (Web), đặt tên bất kỳ, bấm Register app.
3. Màn hình hiện đoạn `firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., appId: ... }`.
4. Mở file **firebase-config.js** (bằng Notepad), thay 4 giá trị DAN-... bằng 4 giá trị tương ứng. Lưu file.

## Bước 4. Đưa web lên mạng (Netlify)
1. Vào https://app.netlify.com/drop, đăng ký/đăng nhập.
2. Kéo thả **cả thư mục website** (chứa index.html, firebase-config.js, firebase-shim.js) vào khung.
3. Netlify cho một địa chỉ dạng `ten-ngau-nhien.netlify.app`. Mở thử, đăng nhập bằng tài khoản ở Bước 1.
4. Quay lại Firebase: **Authentication → Settings → Authorized domains → Add domain**, thêm địa chỉ netlify.app vừa có (và tên miền riêng ở Bước 5 nếu có).

## Bước 5. Gắn tên miền riêng (tùy chọn)
1. Mua tên miền (vd ở Mắt Bão, PA Vietnam, Namecheap).
2. Trong Netlify: **Domain management → Add a domain**, nhập tên miền, làm theo hướng dẫn trỏ DNS (Netlify chỉ từng dòng cần nhập ở nơi bạn mua tên miền). Chờ vài phút đến vài giờ.
3. Nhớ thêm tên miền này vào **Authorized domains** của Firebase như Bước 4.4.


## Bước 6. Sao lưu dữ liệu (rất nên làm)
Dữ liệu nằm trên Firebase nên không mất khi hỏng máy, nhưng vẫn cần bản dự phòng phòng khi xóa nhầm hoặc có sự cố.

**Cách 1: nút sao lưu trong web (dễ nhất, miễn phí)**
- Cột menu bên trái có khung **Sao lưu dữ liệu**. Bấm **Tải bản sao lưu** để tải về một file `.json` chứa toàn bộ khách hàng, chi tiêu, công nợ, bảng giá.
- Khung này nhắc bạn khi đã quá 7 ngày chưa sao lưu. Nên sao lưu **mỗi tuần**, và trước khi sửa hay xóa số lượng lớn.
- Cất file ở ít nhất 2 nơi: máy tính và Google Drive hoặc email của bạn.

**Cách khôi phục khi có sự cố**
1. Mở web, đăng nhập.
2. Bấm **Khôi phục từ file**, chọn file sao lưu gần nhất.
3. Web hỏi xác nhận, bấm OK. Dữ liệu trong file được ghi lại. Dữ liệu cùng mã sẽ bị ghi đè, dữ liệu thêm sau ngày sao lưu vẫn còn.
4. Nếu dự án Firebase bị xóa hẳn, tạo dự án mới theo Bước 1–3, rồi khôi phục bằng file như trên.

**Cách 2: Firebase tự sao lưu (tùy chọn, cần nâng gói Blaze và gắn thẻ thanh toán)**
Trong Firebase: Firestore Database → tab **Disaster Recovery** → bật lịch sao lưu hằng ngày. Với vài chục khách, chi phí gần như bằng 0, nhưng bạn nên đặt hạn mức chi tiêu thấp trong Google Cloud Billing.

## Tóm tắt quy trình
Tạo dự án Firebase → bật Firestore + đăng nhập → dán luật bảo mật → dán thông tin kết nối → đưa lên Netlify → (gắn tên miền) → tải bản sao lưu mỗi tuần.


## Chia sẻ bảng chi tiêu cho khách xem (không cần đăng nhập)
1. Vào Firebase, mở **Firestore Database → Rules**, thay toàn bộ luật bằng đoạn sau rồi bấm **Publish**:

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
   Đoạn này chỉ cho phép người ngoài **đọc đúng một bảng khi có link**. Không ai xem được danh sách hay dữ liệu khác.
2. Trong web, mở bảng chi tiêu của khách, bấm **Tạo link chia sẻ**, rồi **Sao chép** và gửi link cho khách.
3. Link chỉ xem, không sửa được, không có phí ngân hàng và phí thực nhận. Số liệu tự cập nhật khi bạn sửa bảng.
4. Muốn thu hồi, bấm **Tắt chia sẻ**. Link cũ sẽ không mở được nữa.

## Lưu ý
- Dữ liệu ở trang Claude cũ **không tự chuyển sang** web mới. Web mới bắt đầu trống, sạch dữ liệu mẫu.
- Muốn sửa giao diện hay thêm tính năng: nhắn cho Claude, nhận file mới, kéo thả lại lên Netlify.
- Gói miễn phí của Firebase và Netlify dư sức cho việc quản lý vài chục khách.
