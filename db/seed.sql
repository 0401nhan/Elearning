USE eb_elearning;

SET NAMES utf8mb4;

INSERT INTO departments (id, code, name, description) VALUES
  (1, 'HCNS', 'HCNS', 'Hành chính nhân sự và đào tạo nội bộ'),
  (2, 'HSE', 'HSE', 'An toàn, sức khỏe và môi trường'),
  (3, 'KTVP', 'Kỹ thuật Văn Phòng', 'Đội kỹ thuật văn phòng'),
  (4, 'KTHT', 'Kỹ thuật hiện trường', 'Đội kỹ thuật hiện trường'),
  (5, 'DIEUPHOI', 'Điều phối', 'Bộ phận điều phối vận hành'),
  (6, 'KETOAN', 'Kế toán', 'Bộ phận kế toán')
ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name), description = VALUES(description);

INSERT INTO roles (id, code, name, description) VALUES
  (1, 'employee', 'Nhân sự', 'Xem tài liệu, làm thử, làm chính thức, xem kết quả cá nhân'),
  (2, 'department_manager', 'Trưởng phòng', 'Xem kết quả nhân sự thuộc phòng mình'),
  (6, 'admin', 'Admin', 'Toàn quyền')
ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name), description = VALUES(description);

INSERT INTO permissions (id, code, name) VALUES
  (1, 'materials.read', 'Xem tài liệu'),
  (2, 'practice.create', 'Làm thử'),
  (3, 'official.create', 'Làm chính thức'),
  (4, 'results.self.read', 'Xem kết quả cá nhân'),
  (5, 'results.department.read', 'Xem kết quả theo phòng ban'),
  (6, 'admin.dashboard.read', 'Xem dashboard admin'),
  (7, 'questions.manage', 'Quản lý ngân hàng câu hỏi'),
  (8, 'materials.manage', 'Quản lý tài liệu đào tạo'),
  (9, 'assignments.manage', 'Giao bài test'),
  (10, 'system.manage', 'Cài đặt hệ thống')
ON DUPLICATE KEY UPDATE name = VALUES(name);

DELETE FROM role_permissions
WHERE role_id IN (
  SELECT id FROM roles WHERE code IN ('employee', 'department_manager', 'admin')
);

INSERT INTO role_permissions (role_id, permission_id) VALUES
  (1,1),(1,2),(1,3),(1,4),
  (2,1),(2,2),(2,3),(2,4),(2,5),
  (6,1),(6,2),(6,3),(6,4),(6,5),(6,6),(6,7),(6,8),(6,9),(6,10);

DELETE FROM roles
WHERE code NOT IN ('employee', 'department_manager', 'admin');

INSERT INTO employees
  (id, employee_code, username, full_name, phone, password_hash, email, department_id, work_area, position_title, hire_date, avatar_initial)
VALUES
  (1, 'EB001', 'nguyenvana', 'Nguyễn Văn A', '0901234567', 'pbkdf2_sha256$120000$EB001$vuxfBAY-gs3YmcvPPGhhrMJGr2dUCJBCWmCS4neqlX0', 'nguyenvana@electricbird.vn', 4, 'TPHCM', 'Kỹ thuật hiện trường', '2022-05-01', 'A'),
  (2, 'EB002', 'tranthib', 'Trần Thị B', '0902345678', 'pbkdf2_sha256$120000$EB002$bwiroMlrF4HoQHOd0k8Hsl5CxzUxgxPxpB-apRhvLi0', 'tranthib@electricbird.vn', 1, 'Bình Dương', 'Nhân sự', '2023-03-15', 'B'),
  (3, 'EB003', 'levanc', 'Lê Văn C', '0903456789', 'pbkdf2_sha256$120000$EB003$oX0zYhPIvFGtNLqdw5pTARVaYoDRRccjBvxWQtF4alw', 'levanc@electricbird.vn', 3, 'Đồng Nai', 'Kỹ sư cơ điện', '2021-11-20', 'C'),
  (4, 'EB004', 'phamthid', 'Phạm Thị D', '0904567890', 'pbkdf2_sha256$120000$EB004$dp24lyDFc0CyKLULh5pf3M6SnfqHHc33WhNdmIFUaCE', 'phamthid@electricbird.vn', 5, 'Miền Bắc', 'Điều phối hiện trường', '2022-07-10', 'D'),
  (5, 'EB005', 'hoangvane', 'Hoàng Văn E', '0905678901', 'pbkdf2_sha256$120000$EB005$8DCHxlYzYO8UHscf2ZBeCtFjIZE6ITR69_h2RfNiGH0', 'hoangvane@electricbird.vn', 2, 'Bà Rịa Vũng Tàu', 'Trưởng phòng HSE', '2023-01-05', 'E'),
  (6, 'MGR_HCNS', 'manager_hcns', 'Trưởng phòng HCNS', '0911111111', 'pbkdf2_sha256$120000$ADMIN01$6XMYf5c3rLBtfe9Y61-jXLwPt700YMCkVWvCtuoiZzc', 'manager_hcns@electricbird.vn', 1, 'TPHCM', 'Trưởng phòng HCNS', '2020-01-01', 'H'),
  (7, 'ADMIN', 'admin', 'Admin', 'admin', 'pbkdf2_sha256$120000$ADMIN$eZcR_X1M6YlPmsppvrEE28w5_ZZwBux8rojRNNE0BKQ', 'admin@electricbird.vn', 1, 'TPHCM', 'Admin', '2020-01-01', 'A')
ON DUPLICATE KEY UPDATE
  employee_code = VALUES(employee_code),
  username = VALUES(username),
  full_name = VALUES(full_name),
  phone = VALUES(phone),
  password_hash = IF(password_hash = '', VALUES(password_hash), password_hash),
  email = VALUES(email),
  department_id = VALUES(department_id),
  work_area = VALUES(work_area),
  position_title = VALUES(position_title),
  hire_date = VALUES(hire_date),
  avatar_initial = VALUES(avatar_initial);

DELETE FROM employee_roles WHERE employee_id IN (1,2,3,4,5,6,7);

INSERT INTO employee_roles (employee_id, role_id) VALUES
  (1,1),(2,1),(3,1),(4,1),(5,2),(6,2),(7,6);

INSERT INTO tests
  (id, code, title, department_id, description, question_count, duration_minutes, pass_score, created_by)
VALUES
  (1, 'HCNS_RULES', 'Test Quy định HCNS', 1, 'Kiểm tra kiến thức về quy định, chính sách và quy trình nhân sự.', 40, 20, 80.00, 6),
  (2, 'HSE_RULES', 'Test Quy định HSE', 2, 'Kiểm tra quy định HSE và an toàn lao động.', 40, 20, 80.00, 6),
  (3, 'ATLĐ', 'An toàn lao động (ATLĐ)', 2, 'Kiểm tra kiến thức an toàn lao động tại hiện trường.', 20, 15, 80.00, 6),
  (4, 'FIELD_WORKFLOW', 'Quy trình làm việc hiện trường', 2, 'Quy trình làm việc và báo cáo hiện trường.', 25, 20, 80.00, 6),
  (5, 'QUALITY_CONTROL', 'Kiểm soát chất lượng thi công', 4, 'Quy định nghiệm thu, kiểm soát lỗi và bàn giao hiện trường.', 30, 25, 75.00, 6),
  (6, 'IT_SECURITY', 'An toàn thông tin nội bộ', 3, 'Kiểm tra nhận thức bảo mật tài khoản, dữ liệu và thiết bị làm việc.', 25, 18, 80.00, 6),
  (7, 'FINANCE_PROCESS', 'Quy trình chứng từ kế toán', 6, 'Kiểm tra quy định lập, duyệt và lưu trữ chứng từ thanh toán.', 20, 15, 75.00, 6),
  (8, 'OPERATION_COORDINATION', 'Điều phối vận hành dự án', 5, 'Quy trình điều phối nhân sự, vật tư, lịch thi công và báo cáo tiến độ.', 30, 22, 80.00, 6)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  department_id = VALUES(department_id),
  description = VALUES(description),
  question_count = VALUES(question_count),
  duration_minutes = VALUES(duration_minutes),
  pass_score = VALUES(pass_score);

INSERT INTO training_materials
  (id, title, material_type, content_url, content_text, department_id, version_label, uploaded_by)
VALUES
  (1, 'Quy định chung công ty', 'pdf', '/materials/quy-dinh-chung.pdf', NULL, 1, '1.0', 6),
  (2, 'Quy định HSE hiện trường', 'slide', '/materials/hse-rules.pptx', NULL, 2, '1.1', 6),
  (3, 'Checklist an toàn đầu ngày', 'image', '/materials/hse-checklist.png', NULL, 2, '1.0', 6),
  (4, 'Quy trình làm việc hiện trường', 'text', NULL, 'Nội dung hướng dẫn quy trình làm việc hiện trường.', 2, '1.0', 6),
  (5, 'Biểu mẫu nghiệm thu chất lượng', 'pdf', '/materials/bieu-mau-nghiem-thu.pdf', NULL, 4, '2.0', 6),
  (6, 'Checklist kiểm soát lỗi thi công', 'text', NULL, 'Kiểm tra vật tư, hình ảnh hiện trường, biên bản nghiệm thu và xác nhận khắc phục lỗi trước khi bàn giao.', 4, '1.2', 6),
  (7, 'Hướng dẫn bảo mật tài khoản', 'pdf', '/materials/bao-mat-tai-khoan.pdf', NULL, 3, '1.0', 6),
  (8, 'Quy trình xử lý chứng từ thanh toán', 'slide', '/materials/quy-trinh-chung-tu.pptx', NULL, 6, '1.3', 6),
  (9, 'Sơ đồ điều phối vật tư dự án', 'image', '/materials/so-do-dieu-phoi.png', NULL, 5, '1.0', 6),
  (10, 'Quy định báo cáo tiến độ hằng ngày', 'text', NULL, 'Báo cáo tiến độ phải nêu rõ nhân sự, vật tư, rủi ro, ảnh hiện trường và kế hoạch ngày tiếp theo.', 5, '1.1', 6)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  material_type = VALUES(material_type),
  content_url = VALUES(content_url),
  content_text = VALUES(content_text),
  department_id = VALUES(department_id),
  version_label = VALUES(version_label);

INSERT IGNORE INTO test_materials (test_id, material_id, sort_order) VALUES
  (1, 1, 1),
  (2, 2, 1),
  (2, 3, 2),
  (3, 2, 1),
  (3, 3, 2),
  (4, 4, 1),
  (5, 5, 1),
  (5, 6, 2),
  (6, 7, 1),
  (7, 8, 1),
  (8, 9, 1),
  (8, 10, 2);

INSERT INTO question_groups (id, test_id, name, suggested_question_count, sort_order) VALUES
  (1, 1, 'Quy trình nhận việc', 3, 1),
  (2, 1, 'Nội quy công ty', 3, 2),
  (3, 2, 'Kiến thức HSE cơ bản', 3, 1),
  (4, 2, 'Quy định ATLĐ', 4, 2),
  (5, 3, 'PPE / Bảo hộ lao động', 3, 1),
  (6, 4, 'Quy trình xử lý sự cố', 3, 1),
  (7, 5, 'Nghiệm thu chất lượng', 4, 1),
  (8, 5, 'Kiểm soát lỗi hiện trường', 4, 2),
  (9, 6, 'Bảo mật tài khoản', 3, 1),
  (10, 6, 'An toàn dữ liệu', 3, 2),
  (11, 7, 'Chứng từ thanh toán', 3, 1),
  (12, 7, 'Phê duyệt chi phí', 3, 2),
  (13, 8, 'Điều phối nhân sự', 3, 1),
  (14, 8, 'Báo cáo tiến độ', 3, 2)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  suggested_question_count = VALUES(suggested_question_count),
  sort_order = VALUES(sort_order);

INSERT INTO questions (id, test_id, group_id, question_text, explanation, difficulty, created_by) VALUES
  (1, 2, 3, 'Khi phát hiện sự cố mất an toàn, việc đầu tiên bạn cần làm là gì?', 'Khi phát hiện sự cố an toàn, cần báo cáo ngay cho quản lý trực tiếp và bộ phận HSE.', 'easy', 6),
  (2, 2, 5, 'PPE bắt buộc tại khu vực hiện trường gồm những gì?', 'PPE tối thiểu gồm mũ bảo hộ, giày bảo hộ và áo phản quang.', 'easy', 6),
  (3, 1, 2, 'Nhân sự cần dùng thông tin nào để đăng nhập hệ thống?', 'Hệ thống dùng username và số điện thoại đã đăng ký với HCNS.', 'easy', 6),
  (4, 1, 1, 'Bài chính thức được ghi nhận mấy lần theo cấu hình mặc định?', 'Bài chính thức chỉ được ghi nhận 1 lần.', 'medium', 6),
  (5, 3, 5, 'Khi làm việc tại công trường, PPE có bắt buộc không?', 'PPE là bắt buộc tại khu vực công trường.', 'easy', 6),
  (6, 4, 6, 'Sau khi hoàn thành checklist đầu ngày, nhân sự cần làm gì?', 'Nhân sự cần báo cáo kết quả theo quy trình hiện trường.', 'medium', 6),
  (7, 5, 7, 'Khi phát hiện lỗi chất lượng trong quá trình thi công, bước xử lý đầu tiên là gì?', 'Cần ghi nhận lỗi, chụp hình hiện trường và báo ngay cho phụ trách chất lượng.', 'medium', 6),
  (8, 5, 8, 'Biên bản nghiệm thu cần có thông tin nào?', 'Biên bản nghiệm thu cần có hạng mục, kết quả kiểm tra, người xác nhận và thời gian nghiệm thu.', 'easy', 6),
  (9, 5, 8, 'Nếu lỗi chưa được khắc phục, có được bàn giao hạng mục không?', 'Không được bàn giao khi lỗi ảnh hưởng chất lượng hoặc an toàn chưa được khắc phục.', 'hard', 6),
  (10, 6, 9, 'Mật khẩu tài khoản nội bộ nên được xử lý như thế nào?', 'Không chia sẻ mật khẩu và cần đổi khi nghi ngờ bị lộ.', 'easy', 6),
  (11, 6, 10, 'Khi nhận email có file lạ, nhân sự nên làm gì?', 'Không mở file lạ, kiểm tra người gửi và báo IT khi nghi ngờ rủi ro.', 'medium', 6),
  (12, 6, 10, 'Dữ liệu khách hàng có được gửi qua email cá nhân không?', 'Không gửi dữ liệu nội bộ hoặc khách hàng qua email cá nhân.', 'hard', 6),
  (13, 7, 11, 'Chứng từ thanh toán thiếu chữ ký duyệt thì xử lý thế nào?', 'Cần bổ sung phê duyệt trước khi chuyển bước thanh toán.', 'medium', 6),
  (14, 7, 12, 'Chi phí phát sinh ngoài kế hoạch cần điều kiện gì?', 'Chi phí phát sinh cần được giải trình và phê duyệt theo phân quyền.', 'hard', 6),
  (15, 8, 13, 'Khi thiếu vật tư ảnh hưởng tiến độ, điều phối cần làm gì trước?', 'Điều phối cần xác nhận nhu cầu, báo phụ trách dự án và cập nhật kế hoạch cấp vật tư.', 'medium', 6),
  (16, 8, 14, 'Báo cáo tiến độ hằng ngày cần gửi khi nào?', 'Báo cáo tiến độ nên gửi cuối ngày hoặc theo khung giờ dự án đã thống nhất.', 'easy', 6),
  (17, 8, 14, 'Nếu phát sinh rủi ro chậm tiến độ, nội dung nào bắt buộc phải có trong báo cáo?', 'Báo cáo cần nêu nguyên nhân, ảnh hưởng, phương án xử lý và người phụ trách.', 'hard', 6),
  (18, 2, 4, 'Trước khi làm việc trên cao, nhân sự cần kiểm tra gì?', 'Cần kiểm tra dây an toàn, điểm neo, giấy phép làm việc và điều kiện khu vực.', 'medium', 6)
ON DUPLICATE KEY UPDATE
  question_text = VALUES(question_text),
  explanation = VALUES(explanation),
  difficulty = VALUES(difficulty);

INSERT INTO answer_options (question_id, option_label, option_text, is_correct, sort_order) VALUES
  (1, 'A', 'Tiếp tục công việc và báo cáo sau', 0, 1),
  (1, 'B', 'Báo cáo ngay cho quản lý trực tiếp và bộ phận HSE', 1, 2),
  (1, 'C', 'Tự xử lý sự cố', 0, 3),
  (1, 'D', 'Chờ người khác xử lý', 0, 4),
  (2, 'A', 'Mũ bảo hộ, giày bảo hộ và áo phản quang', 1, 1),
  (2, 'B', 'Áo khoác cá nhân', 0, 2),
  (2, 'C', 'Điện thoại và thẻ xe', 0, 3),
  (2, 'D', 'Không bắt buộc', 0, 4),
  (3, 'A', 'Username và số điện thoại đã đăng ký với HCNS', 1, 1),
  (3, 'B', 'Email cá nhân', 0, 2),
  (3, 'C', 'Mã OTP tự tạo', 0, 3),
  (3, 'D', 'Mã số thuế', 0, 4),
  (4, 'A', 'Không giới hạn', 0, 1),
  (4, 'B', '1 lần', 1, 2),
  (4, 'C', '3 lần', 0, 3),
  (4, 'D', 'Theo ý nhân sự', 0, 4),
  (5, 'A', 'Có, bắt buộc tại công trường', 1, 1),
  (5, 'B', 'Không bắt buộc', 0, 2),
  (5, 'C', 'Chỉ bắt buộc khi trời mưa', 0, 3),
  (5, 'D', 'Chỉ cần khi có khách hàng', 0, 4),
  (6, 'A', 'Báo cáo kết quả theo quy trình hiện trường', 1, 1),
  (6, 'B', 'Bỏ qua nếu không có lỗi', 0, 2),
  (6, 'C', 'Chỉ lưu vào điện thoại cá nhân', 0, 3),
  (6, 'D', 'Chờ cuối tuần báo cáo', 0, 4),
  (7, 'A', 'Tiếp tục thi công và ghi nhận sau', 0, 1),
  (7, 'B', 'Ghi nhận lỗi, chụp hình và báo phụ trách chất lượng', 1, 2),
  (7, 'C', 'Tự sửa nếu có thời gian', 0, 3),
  (7, 'D', 'Chỉ báo khi khách hàng phát hiện', 0, 4),
  (8, 'A', 'Hạng mục, kết quả kiểm tra, người xác nhận và thời gian', 1, 1),
  (8, 'B', 'Chỉ cần tên người thi công', 0, 2),
  (8, 'C', 'Chỉ cần hình ảnh hiện trường', 0, 3),
  (8, 'D', 'Không cần lưu biên bản', 0, 4),
  (9, 'A', 'Có, nếu gần hết hạn', 0, 1),
  (9, 'B', 'Có, nếu khách hàng đồng ý miệng', 0, 2),
  (9, 'C', 'Không, cần khắc phục lỗi ảnh hưởng chất lượng/an toàn trước', 1, 3),
  (9, 'D', 'Có thể bàn giao rồi xử lý sau', 0, 4),
  (10, 'A', 'Chia sẻ cho đồng nghiệp để tiện xử lý', 0, 1),
  (10, 'B', 'Không chia sẻ và đổi mật khẩu khi nghi ngờ bị lộ', 1, 2),
  (10, 'C', 'Lưu trong nhóm chat chung', 0, 3),
  (10, 'D', 'Dùng chung cho mọi hệ thống', 0, 4),
  (11, 'A', 'Mở ngay để kiểm tra', 0, 1),
  (11, 'B', 'Không mở, kiểm tra người gửi và báo IT khi nghi ngờ', 1, 2),
  (11, 'C', 'Chuyển tiếp cho toàn bộ phòng ban', 0, 3),
  (11, 'D', 'Tải về máy cá nhân để xem sau', 0, 4),
  (12, 'A', 'Có nếu file nhỏ', 0, 1),
  (12, 'B', 'Có nếu gửi ngoài giờ', 0, 2),
  (12, 'C', 'Không gửi dữ liệu nội bộ hoặc khách hàng qua email cá nhân', 1, 3),
  (12, 'D', 'Có nếu xóa email sau khi gửi', 0, 4),
  (13, 'A', 'Chuyển thanh toán trước rồi bổ sung sau', 0, 1),
  (13, 'B', 'Bổ sung phê duyệt trước khi chuyển bước thanh toán', 1, 2),
  (13, 'C', 'Tự ký thay người duyệt', 0, 3),
  (13, 'D', 'Lưu tạm không cần xử lý', 0, 4),
  (14, 'A', 'Chỉ cần báo miệng', 0, 1),
  (14, 'B', 'Cần giải trình và phê duyệt theo phân quyền', 1, 2),
  (14, 'C', 'Không cần chứng từ', 0, 3),
  (14, 'D', 'Tự động duyệt nếu dưới ngân sách', 0, 4),
  (15, 'A', 'Xác nhận nhu cầu, báo phụ trách dự án và cập nhật kế hoạch', 1, 1),
  (15, 'B', 'Đợi đội thi công tự xử lý', 0, 2),
  (15, 'C', 'Chỉ ghi chú vào cuối tuần', 0, 3),
  (15, 'D', 'Không cần báo nếu thiếu ít', 0, 4),
  (16, 'A', 'Cuối ngày hoặc theo khung giờ dự án thống nhất', 1, 1),
  (16, 'B', 'Khi có yêu cầu kiểm tra', 0, 2),
  (16, 'C', 'Cuối tháng', 0, 3),
  (16, 'D', 'Không cần gửi nếu tiến độ tốt', 0, 4),
  (17, 'A', 'Chỉ nêu tên người phụ trách', 0, 1),
  (17, 'B', 'Nguyên nhân, ảnh hưởng, phương án xử lý và người phụ trách', 1, 2),
  (17, 'C', 'Chỉ gửi hình ảnh hiện trường', 0, 3),
  (17, 'D', 'Chỉ nêu thời gian dự kiến xong', 0, 4),
  (18, 'A', 'Dây an toàn, điểm neo, giấy phép làm việc và điều kiện khu vực', 1, 1),
  (18, 'B', 'Chỉ cần kiểm tra thời tiết', 0, 2),
  (18, 'C', 'Chỉ cần báo cho đồng nghiệp', 0, 3),
  (18, 'D', 'Không cần kiểm tra nếu đã quen việc', 0, 4)
ON DUPLICATE KEY UPDATE
  option_text = VALUES(option_text),
  is_correct = VALUES(is_correct),
  sort_order = VALUES(sort_order);

INSERT INTO test_assignments
  (id, employee_id, test_id, assigned_by, due_at, status, read_progress_percent, practice_attempt_count, official_attempts_used, official_score, completed_at)
VALUES
  (1, 1, 1, 6, '2026-05-31 23:59:59', 'studying', 75.00, 4, 0, NULL, NULL),
  (2, 1, 2, 6, '2026-05-31 23:59:59', 'passed', 100.00, 6, 1, 90.00, '2026-05-10 09:30:00'),
  (3, 1, 3, 6, '2026-05-31 23:59:59', 'failed', 100.00, 3, 1, 65.00, '2026-05-06 15:20:00'),
  (4, 1, 4, 6, '2026-05-31 23:59:59', 'not_started', 0.00, 0, 0, NULL, NULL),
  (5, 2, 1, 6, '2026-05-31 23:59:59', 'failed', 100.00, 3, 1, 62.00, '2026-05-08 10:10:00'),
  (6, 3, 3, 6, '2026-05-31 23:59:59', 'passed', 100.00, 4, 1, 91.00, '2026-05-09 11:25:00'),
  (7, 4, 3, 6, '2026-05-31 23:59:59', 'failed', 100.00, 2, 1, 58.00, '2026-05-09 14:40:00'),
  (8, 5, 2, 6, '2026-05-31 23:59:59', 'passed', 100.00, 6, 1, 95.00, '2026-05-11 08:50:00')
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  read_progress_percent = VALUES(read_progress_percent),
  practice_attempt_count = VALUES(practice_attempt_count),
  official_attempts_used = VALUES(official_attempts_used),
  official_score = VALUES(official_score),
  completed_at = VALUES(completed_at);

INSERT INTO material_progress
  (employee_id, material_id, read_progress_percent, first_viewed_at, last_viewed_at, completed_at)
VALUES
  (1, 1, 75.00, '2026-05-09 08:00:00', '2026-05-13 09:00:00', NULL),
  (1, 2, 100.00, '2026-05-08 08:00:00', '2026-05-10 09:00:00', '2026-05-10 09:00:00'),
  (1, 3, 100.00, '2026-05-08 08:30:00', '2026-05-10 09:10:00', '2026-05-10 09:10:00'),
  (1, 4, 0.00, NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE
  read_progress_percent = VALUES(read_progress_percent),
  last_viewed_at = VALUES(last_viewed_at),
  completed_at = VALUES(completed_at);

INSERT INTO test_attempts
  (id, assignment_id, employee_id, test_id, mode, attempt_no, started_at, submitted_at, time_spent_seconds, total_questions, correct_answers, score, pass_score_snapshot, result_status, is_recorded)
VALUES
  (1, 2, 1, 2, 'official', 1, '2026-05-10 09:12:00', '2026-05-10 09:30:00', 1080, 40, 36, 90.00, 80.00, 'passed', 1),
  (2, 3, 1, 3, 'official', 1, '2026-05-06 15:05:00', '2026-05-06 15:20:00', 900, 20, 13, 65.00, 80.00, 'failed', 1),
  (3, 1, 1, 1, 'practice', 4, '2026-05-13 08:30:00', '2026-05-13 08:45:00', 900, 25, 18, 72.00, 80.00, 'review_required', 0)
ON DUPLICATE KEY UPDATE
  submitted_at = VALUES(submitted_at),
  time_spent_seconds = VALUES(time_spent_seconds),
  total_questions = VALUES(total_questions),
  correct_answers = VALUES(correct_answers),
  score = VALUES(score),
  pass_score_snapshot = VALUES(pass_score_snapshot),
  result_status = VALUES(result_status),
  is_recorded = VALUES(is_recorded);

INSERT INTO retake_requests
  (id, assignment_id, employee_id, test_id, reason, status, requested_at, reviewed_by, reviewed_at, review_note)
VALUES
  (1, 3, 1, 3, 'Cần mở lượt thi lại sau khi học lại tài liệu.', 'pending', '2026-05-06 15:25:00', NULL, NULL, NULL),
  (2, 5, 2, 1, 'Nhân sự cần ôn tập và thi lại.', 'approved', '2026-05-08 10:15:00', 6, '2026-05-08 14:00:00', 'Đã mở lại 1 lượt')
ON DUPLICATE KEY UPDATE
  reason = VALUES(reason),
  status = VALUES(status),
  reviewed_by = VALUES(reviewed_by),
  reviewed_at = VALUES(reviewed_at),
  review_note = VALUES(review_note);

INSERT INTO notifications
  (id, employee_id, title, body, type, is_read)
VALUES
  (1, 1, 'Bạn có bài test Quy định HSE cần hoàn thành', 'Hạn hoàn thành: 31/05/2026. Vui lòng đọc tài liệu trước khi làm chính thức.', 'assignment', 0),
  (2, 1, 'Tài liệu Checklist an toàn đầu ngày đã được cập nhật', 'Bộ phận HSE bổ sung phiên bản mới cho đội hiện trường.', 'material', 0),
  (3, 1, 'Kết quả Test Quy định HSE: Đạt', 'Điểm chính thức 85/100 đã được ghi nhận vào hệ thống đào tạo.', 'result', 1),
  (4, 1, 'Bài An toàn lao động: Chưa đạt', 'Vui lòng học lại tài liệu và liên hệ HR/Quản lý để mở lượt thi mới.', 'retake', 0),
  (5, 1, 'Nhắc hoàn thành Test Quy định HCNS', 'Bạn còn bài Test Quy định HCNS đang học. Hãy hoàn thành trước hạn được giao.', 'assignment', 0),
  (6, 1, 'Tài liệu Quy định chung công ty đã sẵn sàng', 'Tài liệu đào tạo mới đã được gắn với bài test của bạn.', 'material', 0),
  (7, 1, 'Yêu cầu thi lại đang chờ duyệt', 'Yêu cầu mở lượt thi lại của bạn đã được ghi nhận và đang chờ HR xử lý.', 'retake', 0),
  (8, 1, 'Cập nhật hệ thống đào tạo', 'Hệ thống đã bổ sung chức năng xem thông báo và đánh dấu đã đọc.', 'system', 1),
  (9, 2, 'Bạn có bài test Quy định HCNS cần học lại', 'Vui lòng xem lại tài liệu và hoàn thành bài test theo yêu cầu của HR.', 'assignment', 0),
  (10, 2, 'Yêu cầu thi lại đã được duyệt', 'HR đã mở lại lượt thi chính thức cho bài Test Quy định HCNS.', 'retake', 0),
  (11, NULL, 'Thông báo chung từ HCNS', 'Vui lòng kiểm tra các bài test được giao và cập nhật hồ sơ cá nhân khi có thay đổi.', 'system', 0)
ON DUPLICATE KEY UPDATE
  employee_id = VALUES(employee_id),
  title = VALUES(title),
  body = VALUES(body),
  type = VALUES(type),
  is_read = VALUES(is_read);

INSERT INTO support_tickets
  (id, employee_id, category, title, content, status, assigned_to)
VALUES
  (1, 1, 'retake', 'Yêu cầu mở lượt thi lại ATLĐ', 'Tôi đã học lại tài liệu và muốn được mở lượt thi mới.', 'open', 6)
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  title = VALUES(title),
  content = VALUES(content),
  status = VALUES(status),
  assigned_to = VALUES(assigned_to);
