import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const root = process.cwd();
const testCode = "ADMIN_ELEARNING_ONBOARDING";
const testTitle = "Làm quen hệ thống E-Learning cho Admin";
const testDescription =
  "Bài kiểm tra nội bộ giúp admin nắm quy trình đăng nhập, quản lý bài test, ngân hàng câu hỏi, giao bài, theo dõi kết quả và vận hành hệ thống.";

const groupNames = [
  "Đăng nhập và tài khoản",
  "Tổng quan dashboard admin",
  "Nhân sự và phân quyền",
  "Quản lý bài test",
  "Ngân hàng câu hỏi",
  "Tài liệu đào tạo",
  "Giao test và tiến độ",
  "Làm bài và chấm điểm",
  "Thi lại, thông báo, hỗ trợ",
  "Bảo mật và vận hành production"
];

const genericPurposeDistractors = [
  "Tự động cấp toàn quyền cho mọi tài khoản trong hệ thống.",
  "Xóa dữ liệu cũ để làm mới giao diện quản trị.",
  "Bỏ qua kiểm tra quyền để thao tác nhanh hơn.",
  "Thay thế hoàn toàn quy trình đào tạo nội bộ hiện có.",
  "Chỉ tạo dữ liệu mẫu nhưng không phục vụ vận hành thật."
];

const genericActionDistractors = [
  "Thao tác trực tiếp trên database mà không kiểm tra dữ liệu.",
  "Bỏ qua bước xác nhận và lưu thay đổi hàng loạt.",
  "Dùng tài khoản của người khác để xử lý cho nhanh.",
  "Tải lại trang liên tục thay vì đọc thông báo lỗi.",
  "Đổi cấu hình production khi chưa có bản sao lưu."
];

const genericSafeDistractors = [
  "Kiểm tra quyền truy cập trước khi thao tác.",
  "Xem lại dữ liệu sau khi lưu thay đổi.",
  "Ghi nhận thay đổi quan trọng để dễ truy vết.",
  "Dùng bộ lọc để xác minh đúng đối tượng cần xử lý.",
  "Kiểm tra trạng thái phản hồi của hệ thống sau thao tác."
];

const genericSignalDistractors = [
  "Mọi người dùng đều nhìn thấy toàn bộ dữ liệu admin.",
  "Dữ liệu biến mất khỏi danh sách sau mỗi lần tải lại.",
  "Hệ thống yêu cầu đăng nhập lại sau từng thao tác nhỏ.",
  "Các nút lưu vẫn bật dù dữ liệu bắt buộc đang thiếu.",
  "Kết quả hiển thị khác nhau không theo bộ lọc đã chọn."
];

const topics = [
  {
    group: groupNames[0],
    name: "Đăng nhập quản trị",
    purpose: "Xác thực đúng tài khoản trước khi cho phép truy cập khu vực admin.",
    scenario: "admin mới cần vào hệ thống lần đầu",
    action: "Đăng nhập bằng username được cấp, kiểm tra vai trò và đổi mật khẩu nếu chính sách yêu cầu.",
    antiPattern: "Chia sẻ một tài khoản admin chung cho nhiều người sử dụng.",
    signal: "Người dùng vào đúng dashboard theo vai trò và phiên đăng nhập được duy trì bằng cookie bảo mật.",
    explanation: "Đăng nhập là lớp kiểm soát đầu tiên trước khi truy cập dữ liệu đào tạo và kết quả test.",
    difficulty: "easy"
  },
  {
    group: groupNames[0],
    name: "Phiên đăng nhập và cookie",
    purpose: "Giữ trạng thái đăng nhập trong thời gian hợp lệ mà không lộ thông tin nhạy cảm.",
    scenario: "admin mở lại trình duyệt sau khi đã đăng nhập",
    action: "Kiểm tra phiên qua API /api/me và yêu cầu đăng nhập lại nếu token hết hạn.",
    antiPattern: "Lưu mật khẩu thô trong localStorage hoặc hiển thị token trên giao diện.",
    signal: "Phiên hợp lệ tự khôi phục, phiên hết hạn quay về màn hình đăng nhập.",
    explanation: "Cookie httpOnly giúp giảm rủi ro lộ token qua JavaScript phía client.",
    difficulty: "medium"
  },
  {
    group: groupNames[0],
    name: "SESSION_SECRET",
    purpose: "Ký và xác minh session token để ngăn giả mạo phiên đăng nhập.",
    scenario: "server production báo thiếu SESSION_SECRET",
    action: "Tạo chuỗi bí mật dài trong file .env production và restart app với biến môi trường mới.",
    antiPattern: "Dùng giá trị mặc định hoặc public SESSION_SECRET trên production.",
    signal: "API đăng nhập set cookie thành công và /api/me nhận diện đúng người dùng.",
    explanation: "SESSION_SECRET phải ổn định giữa các lần restart để session hiện tại vẫn xác minh được.",
    difficulty: "medium"
  },
  {
    group: groupNames[0],
    name: "Hồ sơ cá nhân",
    purpose: "Cho phép người dùng kiểm tra thông tin tài khoản, phòng ban và vai trò của mình.",
    scenario: "admin thấy thông tin phòng ban hoặc email chưa đúng",
    action: "Vào hồ sơ cá nhân để kiểm tra và cập nhật thông tin được phép chỉnh sửa.",
    antiPattern: "Sửa trực tiếp dữ liệu nhân sự trong DB mà không qua quy trình quản trị.",
    signal: "Thông tin hiển thị nhất quán giữa hồ sơ, dashboard và danh sách nhân sự.",
    explanation: "Hồ sơ cá nhân giúp người dùng xác nhận dữ liệu nền trước khi xử lý nghiệp vụ.",
    difficulty: "easy"
  },
  {
    group: groupNames[0],
    name: "Đăng xuất",
    purpose: "Kết thúc phiên làm việc và xóa cookie phiên khỏi trình duyệt.",
    scenario: "admin dùng máy tính chung hoặc rời khỏi ca làm việc",
    action: "Bấm đăng xuất và kiểm tra hệ thống quay lại màn hình đăng nhập.",
    antiPattern: "Chỉ đóng tab trình duyệt rồi để phiên đăng nhập còn hiệu lực trên máy chung.",
    signal: "Cookie phiên bị hết hạn và các API cần đăng nhập trả về trạng thái chưa đăng nhập.",
    explanation: "Đăng xuất đúng cách giảm rủi ro người khác dùng lại phiên admin.",
    difficulty: "easy"
  },
  {
    group: groupNames[1],
    name: "Dashboard tổng quan",
    purpose: "Tóm tắt tình hình giao test, hoàn thành, đạt, chưa đạt và điểm trung bình.",
    scenario: "ban quản lý muốn xem nhanh tình hình đào tạo trong ngày",
    action: "Mở dashboard admin và đọc các thẻ chỉ số trước khi xem chi tiết.",
    antiPattern: "Đánh giá tình hình chỉ dựa trên một nhân sự hoặc một bài test riêng lẻ.",
    signal: "Các chỉ số tổng quan khớp với dữ liệu trong bảng kết quả khi áp dụng cùng bộ lọc.",
    explanation: "Dashboard giúp admin phát hiện xu hướng trước khi đi vào từng hồ sơ.",
    difficulty: "easy"
  },
  {
    group: groupNames[1],
    name: "Bộ lọc kết quả",
    purpose: "Thu hẹp dữ liệu theo phòng ban, trạng thái, bài test và khoảng thời gian.",
    scenario: "admin cần xem nhân sự HSE chưa hoàn thành bài test an toàn",
    action: "Chọn đúng phòng ban, trạng thái và bài test rồi kiểm tra danh sách kết quả.",
    antiPattern: "Xuất báo cáo khi chưa kiểm tra bộ lọc đang áp dụng.",
    signal: "Danh sách, phân trang và tổng số kết quả thay đổi đúng theo bộ lọc đã chọn.",
    explanation: "Bộ lọc giúp báo cáo tập trung vào nhóm cần xử lý thay vì toàn bộ hệ thống.",
    difficulty: "easy"
  },
  {
    group: groupNames[1],
    name: "Bảng kết quả nhân sự",
    purpose: "Hiển thị chi tiết từng nhân sự, bài test, số lần làm thử, điểm và trạng thái.",
    scenario: "admin muốn biết ai chưa đạt bài test chính thức",
    action: "Lọc trạng thái chưa đạt và xem điểm, thời gian làm bài, hoạt động mới nhất.",
    antiPattern: "Kết luận nhân sự chưa học khi chưa xem cả tiến độ đọc tài liệu và lượt làm thử.",
    signal: "Mỗi dòng có nhân sự, bài test, điểm chính thức và trạng thái tương ứng.",
    explanation: "Bảng kết quả là nơi đối chiếu dữ liệu trước khi nhắc nhở hoặc mở thi lại.",
    difficulty: "medium"
  },
  {
    group: groupNames[1],
    name: "Làm mới dữ liệu",
    purpose: "Tải lại dữ liệu dashboard sau khi có thay đổi giao test, kết quả hoặc yêu cầu thi lại.",
    scenario: "admin vừa duyệt thi lại và muốn xem số liệu mới",
    action: "Bấm làm mới hoặc tải lại trang để gọi lại API dữ liệu.",
    antiPattern: "Dựa vào dữ liệu cũ trên màn hình sau khi đã thay đổi trạng thái.",
    signal: "Thông tin mới xuất hiện mà không cần đăng nhập lại.",
    explanation: "Dữ liệu quản trị có thể thay đổi liên tục nên cần thao tác làm mới khi đối chiếu.",
    difficulty: "easy"
  },
  {
    group: groupNames[1],
    name: "Chế độ sáng tối",
    purpose: "Tùy chỉnh giao diện để phù hợp môi trường làm việc mà không đổi dữ liệu nghiệp vụ.",
    scenario: "admin làm việc ban đêm và muốn giảm độ chói màn hình",
    action: "Đổi theme trong phần cài đặt hoặc điều khiển giao diện nếu được hỗ trợ.",
    antiPattern: "Nhầm thay đổi theme với thay đổi trạng thái bài test hoặc quyền người dùng.",
    signal: "Màu giao diện thay đổi nhưng dữ liệu, bộ lọc và kết quả vẫn giữ nguyên.",
    explanation: "Theme là cấu hình trải nghiệm cá nhân, không ảnh hưởng dữ liệu đào tạo.",
    difficulty: "easy"
  },
  {
    group: groupNames[2],
    name: "Tạo nhân sự",
    purpose: "Thêm tài khoản nhân sự để có thể giao tài liệu và bài test trong hệ thống.",
    scenario: "công ty có nhân viên mới cần tham gia đào tạo",
    action: "Tạo nhân sự với mã, username, số điện thoại, phòng ban, vị trí và mật khẩu ban đầu.",
    antiPattern: "Tạo nhiều nhân sự dùng chung username hoặc mã nhân viên.",
    signal: "Nhân sự mới xuất hiện trong danh sách và có thể được giao bài test phù hợp.",
    explanation: "Dữ liệu nhân sự là nền tảng cho phân quyền, giao bài và báo cáo.",
    difficulty: "easy"
  },
  {
    group: groupNames[2],
    name: "Cập nhật phòng ban",
    purpose: "Đảm bảo nhân sự thuộc đúng phòng ban để báo cáo và bộ lọc chính xác.",
    scenario: "nhân sự chuyển từ kỹ thuật văn phòng sang kỹ thuật hiện trường",
    action: "Cập nhật phòng ban trong hồ sơ nhân sự và kiểm tra lại báo cáo liên quan.",
    antiPattern: "Để phòng ban cũ khiến kết quả báo cáo bị gom sai nhóm.",
    signal: "Tên phòng ban mới hiển thị ở danh sách nhân sự, dashboard và kết quả test.",
    explanation: "Phòng ban ảnh hưởng trực tiếp tới phân tích kết quả và giao đào tạo.",
    difficulty: "medium"
  },
  {
    group: groupNames[2],
    name: "Vai trò và quyền",
    purpose: "Xác định người dùng được xem, tạo, sửa hoặc quản trị phần nào trong hệ thống.",
    scenario: "một trưởng phòng cần xem kết quả nhân sự thuộc phòng mình",
    action: "Gán vai trò phù hợp thay vì cấp quyền admin toàn hệ thống.",
    antiPattern: "Cấp role admin cho mọi người để tránh phải cấu hình chi tiết.",
    signal: "Người dùng chỉ thấy các chức năng đúng với vai trò được cấp.",
    explanation: "Phân quyền đúng giúp bảo vệ dữ liệu và giảm thao tác nhầm.",
    difficulty: "medium"
  },
  {
    group: groupNames[2],
    name: "Trạng thái hoạt động của nhân sự",
    purpose: "Kiểm soát tài khoản nào còn được đăng nhập và nhận bài test.",
    scenario: "một nhân sự đã nghỉ việc",
    action: "Chuyển tài khoản về trạng thái không hoạt động thay vì xóa dữ liệu lịch sử.",
    antiPattern: "Xóa nhân sự đã có kết quả test làm mất dữ liệu báo cáo.",
    signal: "Tài khoản không hoạt động không đăng nhập được nhưng lịch sử vẫn còn để báo cáo.",
    explanation: "Vô hiệu hóa tài khoản thường an toàn hơn xóa dữ liệu đã phát sinh.",
    difficulty: "medium"
  },
  {
    group: groupNames[2],
    name: "Tìm kiếm nhân sự",
    purpose: "Nhanh chóng xác định tài khoản theo mã nhân viên, tên, số điện thoại hoặc username.",
    scenario: "admin cần kiểm tra một nhân sự báo không thấy bài test",
    action: "Tìm nhân sự bằng số điện thoại hoặc username rồi kiểm tra trạng thái giao bài.",
    antiPattern: "Tạo tài khoản mới khi chưa tìm kỹ tài khoản hiện có.",
    signal: "Kết quả tìm kiếm trả đúng người và không tạo trùng hồ sơ.",
    explanation: "Tìm kiếm trước khi tạo mới giúp tránh trùng dữ liệu nhân sự.",
    difficulty: "easy"
  },
  {
    group: groupNames[3],
    name: "Tạo bài test",
    purpose: "Khai báo bài kiểm tra với mã, tiêu đề, mô tả, thời lượng, điểm đạt và trạng thái.",
    scenario: "admin cần tạo bài test cho quy trình nội bộ mới",
    action: "Tạo bài test với code duy nhất, cấu hình số câu, thời gian, điểm đạt và lưu ở trạng thái phù hợp.",
    antiPattern: "Dùng cùng một mã test cho nhiều bài khác nhau.",
    signal: "Bài test xuất hiện trong quản lý bài test với cấu hình đúng và không trùng code.",
    explanation: "Code bài test là định danh ổn định để quản lý và tích hợp dữ liệu.",
    difficulty: "easy"
  },
  {
    group: groupNames[3],
    name: "Số câu và thời lượng",
    purpose: "Quy định số câu phát cho lượt làm và thời gian tối đa để hoàn thành.",
    scenario: "bài test có ngân hàng 200 câu nhưng chỉ muốn phát 40 câu mỗi lượt",
    action: "Đặt question_count theo số câu cần phát và duration_minutes theo thời gian làm bài.",
    antiPattern: "Đặt số câu lớn hơn nhiều so với thời gian khiến người học không thể hoàn thành.",
    signal: "Lượt làm hiển thị đúng số câu và tự giới hạn theo thời lượng đã cấu hình.",
    explanation: "Số câu và thời lượng cần cân bằng để bài test đo đúng mục tiêu đào tạo.",
    difficulty: "medium"
  },
  {
    group: groupNames[3],
    name: "Điểm đạt",
    purpose: "Xác định ngưỡng điểm tối thiểu để ghi nhận kết quả đạt.",
    scenario: "quy định nội bộ yêu cầu đạt từ 80 điểm trở lên",
    action: "Cấu hình pass_score là 80 và kiểm tra kết quả sau khi nộp bài.",
    antiPattern: "Đổi điểm đạt sau khi đã có nhiều kết quả mà không thông báo hoặc lưu vết.",
    signal: "Kết quả chính thức tự phân loại đạt hoặc chưa đạt theo ngưỡng đã lưu.",
    explanation: "Điểm đạt là tiêu chí quan trọng trong báo cáo hoàn thành đào tạo.",
    difficulty: "easy"
  },
  {
    group: groupNames[3],
    name: "Trạng thái draft active archived",
    purpose: "Kiểm soát vòng đời bài test từ soạn thảo, sử dụng đến lưu trữ.",
    scenario: "bài test đang soạn câu hỏi và chưa muốn nhân sự thấy",
    action: "Giữ trạng thái draft cho tới khi nội dung sẵn sàng rồi chuyển active.",
    antiPattern: "Chuyển active khi chưa có câu hỏi hoặc đáp án đúng.",
    signal: "Chỉ bài active được dùng để giao và làm bài trong luồng chính.",
    explanation: "Trạng thái giúp admin chuẩn bị nội dung mà chưa ảnh hưởng người học.",
    difficulty: "medium"
  },
  {
    group: groupNames[3],
    name: "Liên kết tài liệu với bài test",
    purpose: "Gắn tài liệu học liên quan để người học ôn trước khi làm bài.",
    scenario: "bài test an toàn cần kèm checklist và slide HSE",
    action: "Chọn tài liệu đào tạo phù hợp trong cấu hình bài test.",
    antiPattern: "Giao bài test mà không cung cấp tài liệu học cần thiết.",
    signal: "Trang chi tiết bài test hiển thị tài liệu liên quan để người học mở và đọc.",
    explanation: "Tài liệu giúp bài test trở thành một quy trình học đầy đủ thay vì chỉ kiểm tra.",
    difficulty: "medium"
  },
  {
    group: groupNames[4],
    name: "Nhóm câu hỏi",
    purpose: "Tổ chức câu hỏi theo chủ đề để dễ quản lý và cân đối nội dung.",
    scenario: "bài test có phần quy trình, bảo mật và báo cáo",
    action: "Tạo nhóm câu hỏi cho từng chủ đề và đặt số câu gợi ý nếu cần.",
    antiPattern: "Đưa toàn bộ câu hỏi vào một nhóm khiến khó rà soát chất lượng.",
    signal: "Ngân hàng câu hỏi hiển thị câu hỏi theo nhóm rõ ràng.",
    explanation: "Nhóm câu hỏi giúp admin kiểm soát độ phủ kiến thức của bài test.",
    difficulty: "easy"
  },
  {
    group: groupNames[4],
    name: "Đáp án đúng",
    purpose: "Xác định lựa chọn được dùng để tính điểm cho từng câu hỏi.",
    scenario: "admin nhập bốn đáp án cho một câu trắc nghiệm",
    action: "Đánh dấu đúng chính xác một đáp án và kiểm tra lại trước khi kích hoạt câu hỏi.",
    antiPattern: "Để câu hỏi không có đáp án đúng hoặc đánh dấu sai đáp án.",
    signal: "Khi chấm điểm, hệ thống tính đúng dựa trên option được đánh dấu is_correct.",
    explanation: "Đáp án đúng là dữ liệu lõi của việc chấm điểm tự động.",
    difficulty: "easy"
  },
  {
    group: groupNames[4],
    name: "Độ khó câu hỏi",
    purpose: "Phân loại câu hỏi dễ, trung bình, khó để cân bằng đề kiểm tra.",
    scenario: "admin muốn bài test có cả câu nhận biết và câu tình huống",
    action: "Gán difficulty phù hợp khi tạo hoặc import câu hỏi.",
    antiPattern: "Đánh dấu toàn bộ câu hỏi là khó dù nội dung chỉ kiểm tra thao tác cơ bản.",
    signal: "Ngân hàng câu hỏi có phân bố độ khó hợp lý theo mục tiêu đào tạo.",
    explanation: "Độ khó giúp admin đánh giá chất lượng đề và trải nghiệm người học.",
    difficulty: "medium"
  },
  {
    group: groupNames[4],
    name: "Import câu hỏi CSV",
    purpose: "Nhập nhanh nhiều câu hỏi theo mẫu cột chuẩn thay vì tạo từng câu thủ công.",
    scenario: "admin có sẵn 200 câu hỏi trong file bảng tính",
    action: "Xuất file theo đúng header mẫu, kiểm tra lỗi dòng rồi import vào bài test.",
    antiPattern: "Import file thiếu cột correct_option hoặc option bắt buộc.",
    signal: "Hệ thống báo số câu import thành công và không phát sinh câu trùng ngoài ý muốn.",
    explanation: "Import CSV giúp tạo ngân hàng câu hỏi lớn nhanh nhưng cần kiểm tra định dạng.",
    difficulty: "medium"
  },
  {
    group: groupNames[4],
    name: "Bật tắt câu hỏi",
    purpose: "Cho phép giữ câu hỏi trong ngân hàng nhưng không phát cho lượt làm nếu chưa sẵn sàng.",
    scenario: "một câu hỏi đang cần rà soát lại đáp án",
    action: "Chuyển câu hỏi sang không hoạt động cho đến khi nội dung được sửa xong.",
    antiPattern: "Xóa ngay câu hỏi có lịch sử sử dụng thay vì tạm tắt.",
    signal: "Câu không hoạt động không được tính vào danh sách câu active của bài test.",
    explanation: "Tắt câu hỏi giúp bảo toàn dữ liệu nhưng vẫn kiểm soát chất lượng đề.",
    difficulty: "medium"
  },
  {
    group: groupNames[5],
    name: "Upload tài liệu",
    purpose: "Đưa file đào tạo vào hệ thống để liên kết với bài test.",
    scenario: "admin cần tải lên PDF hướng dẫn quy trình",
    action: "Upload file đúng định dạng được hỗ trợ và kiểm tra đường dẫn sau khi lưu.",
    antiPattern: "Upload file thực thi hoặc định dạng không được phép.",
    signal: "Tài liệu mở được từ giao diện và có loại nội dung phù hợp.",
    explanation: "Kiểm soát định dạng upload giúp giảm rủi ro bảo mật và lỗi hiển thị.",
    difficulty: "medium"
  },
  {
    group: groupNames[5],
    name: "Loại tài liệu",
    purpose: "Phân loại tài liệu như PDF, hình ảnh, slide, video, link hoặc text.",
    scenario: "admin thêm một đường dẫn video hướng dẫn",
    action: "Chọn loại video hoặc link phù hợp để giao diện xử lý đúng.",
    antiPattern: "Đánh dấu link bên ngoài là PDF khiến người học không mở đúng cách.",
    signal: "Icon, nhãn loại tài liệu và hành vi mở tài liệu khớp với nội dung thật.",
    explanation: "Loại tài liệu giúp người học biết trước cách xem và chuẩn bị thiết bị.",
    difficulty: "easy"
  },
  {
    group: groupNames[5],
    name: "Đường dẫn tài liệu",
    purpose: "Lưu vị trí file hoặc URL để người học truy cập nội dung đào tạo.",
    scenario: "admin gắn tài liệu lưu trên hệ thống nội bộ",
    action: "Dùng đường dẫn nội bộ hoặc URL http/https hợp lệ.",
    antiPattern: "Dùng URL không rõ nguồn hoặc scheme không được hỗ trợ.",
    signal: "Người học bấm mở tài liệu và trình duyệt tải đúng nội dung.",
    explanation: "Đường dẫn hợp lệ giúp tránh lỗi mở tài liệu và rủi ro bảo mật.",
    difficulty: "medium"
  },
  {
    group: groupNames[5],
    name: "Nội dung text",
    purpose: "Cho phép tạo tài liệu dạng văn bản trực tiếp trong hệ thống.",
    scenario: "admin cần ghi nhanh quy trình ngắn không có file đính kèm",
    action: "Nhập nội dung text rõ ràng, có phiên bản và liên kết với bài test phù hợp.",
    antiPattern: "Đưa nội dung dài không định dạng khiến người học khó đọc trên điện thoại.",
    signal: "Tài liệu text hiển thị rõ ràng trên cả desktop và mobile.",
    explanation: "Tài liệu text phù hợp với hướng dẫn ngắn hoặc thông báo đào tạo.",
    difficulty: "easy"
  },
  {
    group: groupNames[5],
    name: "Tiến độ đọc tài liệu",
    purpose: "Theo dõi mức độ người học đã mở và hoàn thành tài liệu trước khi làm test.",
    scenario: "admin muốn biết nhân sự đã học tài liệu chưa",
    action: "Kiểm tra read_progress_percent và thời điểm xem tài liệu trong dữ liệu liên quan.",
    antiPattern: "Cho rằng người học chưa hoàn thành chỉ vì chưa có điểm chính thức.",
    signal: "Tiến độ đọc được cập nhật khi người học mở và hoàn thành tài liệu.",
    explanation: "Tiến độ tài liệu giúp admin phân biệt chưa học với chưa làm bài.",
    difficulty: "medium"
  },
  {
    group: groupNames[6],
    name: "Giao test",
    purpose: "Tạo assignment để nhân sự thấy bài test trong tài khoản của mình.",
    scenario: "admin muốn toàn bộ nhân sự HSE làm bài an toàn",
    action: "Chọn bài test active, lọc nhân sự HSE và giao bài cho đúng danh sách.",
    antiPattern: "Giao nhầm bài test cho sai phòng ban do không kiểm tra bộ lọc.",
    signal: "Nhân sự được giao thấy bài test trong trang của mình với trạng thái chưa làm.",
    explanation: "Assignment là cầu nối giữa bài test và người học cụ thể.",
    difficulty: "easy"
  },
  {
    group: groupNames[6],
    name: "Hạn hoàn thành",
    purpose: "Đặt thời điểm kỳ vọng nhân sự hoàn thành bài test.",
    scenario: "đợt đào tạo cần hoàn tất trước cuối tháng",
    action: "Thiết lập due_at khi giao bài và theo dõi nhóm quá hạn.",
    antiPattern: "Không đặt hạn cho bài bắt buộc khiến khó nhắc nhở.",
    signal: "Bài test hiển thị hạn hoàn thành và có thể lọc nhóm chưa xong.",
    explanation: "Hạn hoàn thành giúp quản lý tiến độ đào tạo theo kế hoạch.",
    difficulty: "easy"
  },
  {
    group: groupNames[6],
    name: "Trạng thái assignment",
    purpose: "Phản ánh tiến trình của nhân sự từ chưa làm, đang học, đạt đến chưa đạt.",
    scenario: "admin cần biết nhân sự đang ở bước nào",
    action: "Xem trạng thái assignment và đối chiếu với điểm, tiến độ đọc, lượt làm thử.",
    antiPattern: "Chỉ xem điểm chính thức mà bỏ qua trạng thái đang học.",
    signal: "Trạng thái cập nhật sau các hoạt động đọc tài liệu, làm thử hoặc nộp chính thức.",
    explanation: "Trạng thái giúp dashboard và báo cáo phản ánh đúng hành trình học.",
    difficulty: "medium"
  },
  {
    group: groupNames[6],
    name: "Lọc chưa giao",
    purpose: "Tìm những nhân sự chưa được giao bài test để bổ sung kịp thời.",
    scenario: "một phòng ban báo có người chưa thấy bài test",
    action: "Dùng bộ lọc unassigned trong màn hình giao test.",
    antiPattern: "Giao lại cho toàn bộ danh sách mà không kiểm tra ai đã có assignment.",
    signal: "Danh sách chỉ còn những nhân sự chưa có assignment cho bài test đang chọn.",
    explanation: "Lọc chưa giao giúp tránh thao tác trùng và kiểm soát phạm vi đào tạo.",
    difficulty: "easy"
  },
  {
    group: groupNames[6],
    name: "Theo dõi theo phòng ban",
    purpose: "So sánh tiến độ và kết quả đào tạo giữa các phòng ban.",
    scenario: "ban lãnh đạo muốn biết phòng nào hoàn thành thấp",
    action: "Lọc hoặc xem báo cáo theo phòng ban để xác định nhóm cần nhắc nhở.",
    antiPattern: "Gộp tất cả phòng ban khi cần đánh giá trách nhiệm từng nhóm.",
    signal: "Báo cáo hiển thị đúng số lượng và kết quả theo từng phòng ban.",
    explanation: "Theo dõi theo phòng ban giúp giao trách nhiệm đào tạo rõ ràng hơn.",
    difficulty: "medium"
  },
  {
    group: groupNames[7],
    name: "Làm thử",
    purpose: "Cho người học luyện tập và xem đáp án nếu bài test cho phép.",
    scenario: "nhân sự muốn ôn trước khi thi chính thức",
    action: "Khuyến khích làm thử để hiểu dạng câu hỏi và tài liệu liên quan.",
    antiPattern: "Xem lượt làm thử là kết quả chính thức trong báo cáo đạt chưa đạt.",
    signal: "practice_attempt_count tăng nhưng official_score chưa thay đổi nếu chưa thi chính thức.",
    explanation: "Làm thử phục vụ học tập, còn kết quả chính thức dùng để ghi nhận hoàn thành.",
    difficulty: "easy"
  },
  {
    group: groupNames[7],
    name: "Làm chính thức",
    purpose: "Ghi nhận kết quả được tính vào báo cáo hoàn thành đào tạo.",
    scenario: "người học đã ôn xong và muốn nộp kết quả chính thức",
    action: "Bắt đầu lượt chính thức, trả lời trong thời gian quy định và nộp bài.",
    antiPattern: "Cho phép làm lại vô hạn lượt chính thức mà không qua quy trình thi lại.",
    signal: "official_score, official_attempts_used và completed_at được cập nhật sau khi nộp.",
    explanation: "Lượt chính thức cần kiểm soát số lần để kết quả có giá trị quản trị.",
    difficulty: "medium"
  },
  {
    group: groupNames[7],
    name: "Lưu nháp đáp án",
    purpose: "Giảm rủi ro mất lựa chọn trong khi người học đang làm bài chính thức.",
    scenario: "người học mất kết nối tạm thời khi đang làm bài",
    action: "Dựa vào cơ chế lưu nháp để khôi phục lựa chọn đã ghi nhận gần nhất.",
    antiPattern: "Tắt trình duyệt nhiều lần để cố kéo dài thời gian làm bài.",
    signal: "Đáp án đã chọn được lưu theo attempt và có thể dùng khi hết giờ.",
    explanation: "Lưu nháp hỗ trợ ổn định trải nghiệm nhưng không thay đổi giới hạn thời gian.",
    difficulty: "hard"
  },
  {
    group: groupNames[7],
    name: "Chấm điểm tự động",
    purpose: "Tính số câu đúng và điểm phần trăm dựa trên đáp án đúng đã cấu hình.",
    scenario: "người học nộp bài chính thức",
    action: "Hệ thống so sánh selected_option_id với đáp án đúng và tính score.",
    antiPattern: "Sửa đáp án đúng sau khi đã có kết quả mà không cân nhắc ảnh hưởng báo cáo.",
    signal: "Điểm số, số câu đúng và trạng thái kết quả xuất hiện ngay sau khi nộp.",
    explanation: "Chấm điểm tự động phụ thuộc vào chất lượng ngân hàng câu hỏi và đáp án.",
    difficulty: "medium"
  },
  {
    group: groupNames[7],
    name: "Kết quả đạt chưa đạt",
    purpose: "Phân loại kết quả dựa trên điểm chính thức và ngưỡng pass_score.",
    scenario: "nhân sự đạt 78 điểm với pass_score 80",
    action: "Ghi nhận là chưa đạt và hướng dẫn ôn lại hoặc gửi yêu cầu thi lại nếu cần.",
    antiPattern: "Tự sửa điểm trong database để chuyển trạng thái đạt.",
    signal: "Trạng thái assignment phản ánh đúng passed hoặc failed theo điểm đã nộp.",
    explanation: "Trạng thái đạt/chưa đạt là dữ liệu quan trọng cho báo cáo tuân thủ đào tạo.",
    difficulty: "medium"
  },
  {
    group: groupNames[8],
    name: "Yêu cầu thi lại",
    purpose: "Cho người học gửi lý do xin mở thêm lượt chính thức sau khi chưa đạt hoặc hết lượt.",
    scenario: "nhân sự đã ôn lại và muốn làm chính thức thêm một lần",
    action: "Gửi yêu cầu thi lại với lý do rõ ràng để admin xem xét.",
    antiPattern: "Tạo assignment mới để né quy trình duyệt thi lại.",
    signal: "Yêu cầu xuất hiện trong danh sách chờ duyệt của admin.",
    explanation: "Yêu cầu thi lại giúp kiểm soát ngoại lệ mà vẫn lưu lịch sử xử lý.",
    difficulty: "easy"
  },
  {
    group: groupNames[8],
    name: "Duyệt thi lại",
    purpose: "Admin quyết định chấp thuận hoặc từ chối yêu cầu mở thêm lượt thi chính thức.",
    scenario: "admin nhận yêu cầu thi lại có lý do hợp lệ",
    action: "Xem điểm, số lượt đã dùng, lý do và duyệt nếu phù hợp quy định.",
    antiPattern: "Duyệt hàng loạt mọi yêu cầu mà không kiểm tra lý do.",
    signal: "Số lượt chính thức tối đa tăng theo yêu cầu đã được duyệt.",
    explanation: "Duyệt thi lại cần cân bằng hỗ trợ người học và tính nghiêm túc của kiểm tra.",
    difficulty: "medium"
  },
  {
    group: groupNames[8],
    name: "Thông báo",
    purpose: "Gửi hoặc hiển thị thông tin quan trọng về bài test, kết quả và yêu cầu xử lý.",
    scenario: "admin muốn nhắc nhân sự còn bài chưa hoàn thành",
    action: "Sử dụng thông báo phù hợp để người học biết việc cần làm.",
    antiPattern: "Gửi quá nhiều thông báo không liên quan khiến người học bỏ qua cảnh báo quan trọng.",
    signal: "Người nhận thấy thông báo đúng nội dung và trạng thái đọc được cập nhật.",
    explanation: "Thông báo giúp kết nối luồng quản trị với hành động của người học.",
    difficulty: "easy"
  },
  {
    group: groupNames[8],
    name: "Phiếu hỗ trợ",
    purpose: "Ghi nhận vấn đề người dùng gặp phải như đăng nhập, tài liệu, bài test hoặc hệ thống.",
    scenario: "người học không mở được tài liệu đào tạo",
    action: "Tạo phiếu hỗ trợ với danh mục, tiêu đề và nội dung rõ ràng.",
    antiPattern: "Trao đổi miệng không lưu lại khiến admin khó theo dõi xử lý.",
    signal: "Phiếu hỗ trợ có trạng thái open, in_progress, resolved hoặc closed.",
    explanation: "Phiếu hỗ trợ giúp quản trị vấn đề có trách nhiệm và lịch sử rõ ràng.",
    difficulty: "easy"
  },
  {
    group: groupNames[8],
    name: "Heartbeat hoạt động",
    purpose: "Cập nhật dấu hiệu người dùng đang hoạt động để hỗ trợ theo dõi phiên làm việc.",
    scenario: "admin muốn biết tài khoản vừa hoạt động gần đây",
    action: "Dựa vào last_login_at hoặc heartbeat để tham khảo trạng thái gần đây.",
    antiPattern: "Xem trạng thái online là bằng chứng chắc chắn người dùng đang làm bài.",
    signal: "Thời điểm hoạt động gần nhất được cập nhật định kỳ khi người dùng còn phiên.",
    explanation: "Heartbeat hỗ trợ quan sát vận hành nhưng không thay thế dữ liệu bài làm.",
    difficulty: "hard"
  },
  {
    group: groupNames[9],
    name: "Biến môi trường .env",
    purpose: "Cung cấp cấu hình database, session và port cho ứng dụng khi chạy server.",
    scenario: "app production báo thiếu cấu hình",
    action: "Kiểm tra .env thật trên server, không chỉ .env.example, rồi restart với môi trường mới.",
    antiPattern: "Đưa mật khẩu database và SESSION_SECRET lên GitHub.",
    signal: "App đọc đúng database, session hoạt động và server lắng nghe đúng port.",
    explanation: ".env.example chỉ là mẫu, còn production cần file hoặc biến môi trường thật.",
    difficulty: "medium"
  },
  {
    group: groupNames[9],
    name: "Healthcheck database",
    purpose: "Kiểm tra nhanh ứng dụng có kết nối được MySQL hay không.",
    scenario: "sau deploy, admin muốn biết DB đã sẵn sàng chưa",
    action: "Gọi /api/health/db và kiểm tra phản hồi ok là true.",
    antiPattern: "Kết luận app hoạt động đầy đủ chỉ vì trang HTML tải được.",
    signal: "Endpoint health trả { ok: true } khi kết nối database thành công.",
    explanation: "Healthcheck là bước đầu, còn đăng nhập và API nghiệp vụ vẫn cần kiểm tra riêng.",
    difficulty: "easy"
  },
  {
    group: groupNames[9],
    name: "Build và start production",
    purpose: "Biên dịch Next.js và khởi động server production ổn định.",
    scenario: "server vừa pull code mới từ GitHub",
    action: "Chạy npm ci, npm run build, rồi npm run start hoặc restart PM2.",
    antiPattern: "Chạy app.js khi chưa có bản build .next hợp lệ.",
    signal: "Server báo ready ở port cấu hình và các route API phản hồi bình thường.",
    explanation: "app.js khởi động server nhưng không thay thế bước build production.",
    difficulty: "medium"
  },
  {
    group: groupNames[9],
    name: "Quyền database production",
    purpose: "Đảm bảo MySQL user có quyền truy cập database và tạo bảng khi cần.",
    scenario: "app báo Access denied for user khi khởi động",
    action: "Cấp quyền user cho đúng database hoặc sửa DATABASE_NAME theo tên thật trên hosting.",
    antiPattern: "Đổi code ứng dụng khi nguyên nhân là user DB chưa được grant quyền.",
    signal: "User có thể SHOW TABLES và app tự kiểm tra database thành công.",
    explanation: "Ứng dụng không thể tự cấp quyền MySQL nếu user chưa có privilege.",
    difficulty: "hard"
  },
  {
    group: groupNames[9],
    name: "Sao lưu và kiểm soát thay đổi",
    purpose: "Giảm rủi ro mất dữ liệu khi seed, import hoặc cập nhật production.",
    scenario: "admin chuẩn bị import số lượng lớn câu hỏi",
    action: "Sao lưu database, chạy thử trên môi trường an toàn và kiểm tra log sau khi import.",
    antiPattern: "Chạy script seed trên production khi chưa biết script có xóa hay ghi đè dữ liệu không.",
    signal: "Có bản backup, có log thao tác và dữ liệu sau import đúng số lượng mong muốn.",
    explanation: "Sao lưu là lớp bảo vệ bắt buộc trước các thao tác dữ liệu hàng loạt.",
    difficulty: "hard"
  }
];

async function loadEnvFile(filename) {
  try {
    const content = await readFile(path.join(root, filename), "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return {
    host: requireEnv("DATABASE_HOST"),
    port: Number(requireEnv("DATABASE_PORT")),
    user: requireEnv("DATABASE_USER"),
    password: requireEnv("DATABASE_PASSWORD"),
    database: requireEnv("DATABASE_NAME"),
    charset: "utf8mb4"
  };
}

function unique(values) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index);
}

function makeOptions(correctText, distractors, seed) {
  const fallback = [
    ...genericPurposeDistractors,
    ...genericActionDistractors,
    ...genericSafeDistractors,
    ...genericSignalDistractors
  ];
  const values = unique([correctText, ...distractors, ...fallback]).slice(0, 4);
  const shift = seed % values.length;
  const rotated = [...values.slice(shift), ...values.slice(0, shift)];

  return rotated.map((text, index) => ({
    label: ["A", "B", "C", "D"][index],
    text,
    isCorrect: text === correctText
  }));
}

function buildQuestions() {
  return topics.flatMap((topic, topicIndex) => {
    const base = topicIndex * 4;
    const safeDistractors = unique([topic.action, topic.signal, ...genericSafeDistractors]);

    return [
      {
        group: topic.group,
        difficulty: topic.difficulty,
        questionText: `Mục tiêu chính của chức năng "${topic.name}" trong hệ thống E-Learning là gì?`,
        explanation: topic.explanation,
        options: makeOptions(topic.purpose, genericPurposeDistractors, base)
      },
      {
        group: topic.group,
        difficulty: topic.difficulty,
        questionText: `Khi xử lý tình huống "${topic.scenario}", admin nên làm gì đúng nhất?`,
        explanation: topic.explanation,
        options: makeOptions(topic.action, genericActionDistractors, base + 1)
      },
      {
        group: topic.group,
        difficulty: topic.difficulty,
        questionText: `Hành động nào là rủi ro cần tránh khi dùng "${topic.name}"?`,
        explanation: topic.explanation,
        options: makeOptions(topic.antiPattern, safeDistractors, base + 2)
      },
      {
        group: topic.group,
        difficulty: topic.difficulty,
        questionText: `Dấu hiệu nào cho thấy "${topic.name}" đã được cấu hình hoặc xử lý đúng?`,
        explanation: topic.explanation,
        options: makeOptions(topic.signal, genericSignalDistractors, base + 3)
      }
    ];
  });
}

async function getAdminCreatorId(connection) {
  const [rows] = await connection.query(
    `
    SELECT e.id
    FROM employees e
    JOIN employee_roles er ON er.employee_id = e.id
    JOIN roles r ON r.id = er.role_id
    WHERE r.code = 'admin'
    ORDER BY e.id
    LIMIT 1
    `
  );

  return rows[0]?.id ?? null;
}

async function upsertTest(connection, creatorId) {
  await connection.execute(
    `
    INSERT INTO tests
      (code, title, department_id, description, question_count, duration_minutes, pass_score,
       max_official_attempts, allow_unlimited_practice, randomize_questions, randomize_answers,
       show_practice_answers, show_official_answers, status, created_by)
    VALUES (?, ?, NULL, ?, 200, 120, 80.00, 3, 1, 1, 1, 1, 1, 'active', ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      department_id = VALUES(department_id),
      description = VALUES(description),
      question_count = VALUES(question_count),
      duration_minutes = VALUES(duration_minutes),
      pass_score = VALUES(pass_score),
      max_official_attempts = VALUES(max_official_attempts),
      allow_unlimited_practice = VALUES(allow_unlimited_practice),
      randomize_questions = VALUES(randomize_questions),
      randomize_answers = VALUES(randomize_answers),
      show_practice_answers = VALUES(show_practice_answers),
      show_official_answers = VALUES(show_official_answers),
      status = VALUES(status)
    `,
    [testCode, testTitle, testDescription, creatorId]
  );

  const [rows] = await connection.query("SELECT id FROM tests WHERE code = ? LIMIT 1", [testCode]);
  return rows[0].id;
}

async function replaceQuestionBank(connection, testId, creatorId) {
  const questions = buildQuestions();

  if (questions.length !== 200) {
    throw new Error(`Expected 200 generated questions, got ${questions.length}.`);
  }

  await connection.query(
    `
    DELETE ao
    FROM answer_options ao
    JOIN questions q ON q.id = ao.question_id
    WHERE q.test_id = ?
    `,
    [testId]
  );
  await connection.query("DELETE FROM questions WHERE test_id = ?", [testId]);
  await connection.query("DELETE FROM question_groups WHERE test_id = ?", [testId]);

  await connection.query(
    "INSERT INTO question_groups (test_id, name, suggested_question_count, sort_order) VALUES ?",
    [groupNames.map((name, index) => [testId, name, 20, index + 1])]
  );

  const [groupRows] = await connection.query("SELECT id, name FROM question_groups WHERE test_id = ?", [testId]);
  const groupIdByName = new Map(groupRows.map((row) => [row.name, row.id]));

  for (const [index, question] of questions.entries()) {
    const groupId = groupIdByName.get(question.group);
    if (!groupId) {
      throw new Error(`Missing question group: ${question.group}`);
    }

    const [result] = await connection.execute(
      `
      INSERT INTO questions (test_id, group_id, question_text, explanation, difficulty, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      `,
      [testId, groupId, question.questionText, question.explanation, question.difficulty, creatorId]
    );

    await connection.query(
      "INSERT INTO answer_options (question_id, option_label, option_text, is_correct, sort_order) VALUES ?",
      [
        question.options.map((option, optionIndex) => [
          result.insertId,
          option.label,
          option.text,
          option.isCorrect ? 1 : 0,
          optionIndex + 1
        ])
      ]
    );

    if ((index + 1) % 50 === 0) {
      console.log(`Seeded ${index + 1}/200 questions...`);
    }
  }
}

async function assignToAdminUsers(connection, testId, creatorId) {
  if (process.env.ASSIGN_ADMIN_ONBOARDING_TEST === "false") {
    console.log("Skipped admin assignments because ASSIGN_ADMIN_ONBOARDING_TEST=false.");
    return 0;
  }

  const [result] = await connection.query(
    `
    INSERT IGNORE INTO test_assignments (employee_id, test_id, assigned_by, due_at, status)
    SELECT DISTINCT e.id, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), 'not_started'
    FROM employees e
    JOIN employee_roles er ON er.employee_id = e.id
    JOIN roles r ON r.id = er.role_id
    WHERE e.is_active = 1
      AND r.code IN ('admin', 'hr_admin', 'hse_admin', 'it_admin')
    `,
    [testId, creatorId]
  );

  return result.affectedRows ?? 0;
}

async function main() {
  await loadEnvFile(".env");

  const connection = await mysql.createConnection(getDatabaseConfig());

  try {
    await connection.beginTransaction();

    const creatorId = await getAdminCreatorId(connection);
    const testId = await upsertTest(connection, creatorId);
    await replaceQuestionBank(connection, testId, creatorId);
    const assignedCount = await assignToAdminUsers(connection, testId, creatorId);

    await connection.commit();

    console.log(`Created or updated test "${testTitle}" (${testCode}).`);
    console.log("Question groups: 10.");
    console.log("Questions: 200.");
    console.log(`Admin assignments inserted: ${assignedCount}.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed admin onboarding test:");
  console.error(error);
  process.exit(1);
});
