# Electricbird E-Learning Database

Database dùng MySQL local. Thông tin kết nối đặt trong `.env`:

- Charset: `utf8mb4`

Chạy khởi tạo schema và dữ liệu mẫu:

```bash
npm run db:init
```

Tài khoản mẫu `username` / `mật khẩu`:

- Admin toàn quyền: `admin` / `admin`
- Trưởng phòng HSE: `hoangvane` / `0905678901`
- Nhân sự: `nguyenvana` / `0901234567`

Các nhóm bảng chính:

- `employees`, `departments`, `roles`, `permissions`: nhân sự và phân quyền.
- `tests`, `training_materials`, `test_materials`: bài test và tài liệu học.
- `question_groups`, `questions`, `answer_options`: ngân hàng câu hỏi.
- `test_assignments`, `material_progress`: bài được giao và tiến độ học.
- `test_attempts`, `attempt_questions`, `attempt_question_options`, `attempt_answers`: lượt làm thử/chính thức, thứ tự câu hỏi/đáp án và đáp án đã chọn.
- `retake_requests`, `notifications`, `support_tickets`: thi lại, thông báo và hỗ trợ.
- `v_admin_results`: view phục vụ bảng kết quả admin.
