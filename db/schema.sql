CREATE DATABASE IF NOT EXISTS eb_elearning
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE eb_elearning;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS employees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_code VARCHAR(30) NOT NULL,
  username VARCHAR(120) NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(220) NOT NULL,
  email VARCHAR(180) NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  work_area VARCHAR(120) NULL,
  position_title VARCHAR(160) NULL,
  hire_date DATE NULL,
  avatar_initial VARCHAR(5) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employees_code (employee_code),
  UNIQUE KEY uq_employees_username (username),
  KEY idx_employees_phone (phone),
  KEY idx_employees_department (department_id),
  CONSTRAINT fk_employees_department
    FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS employee_roles (
  employee_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (employee_id, role_id),
  CONSTRAINT fk_employee_roles_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_employee_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  title VARCHAR(220) NOT NULL,
  department_id BIGINT UNSIGNED NULL,
  description TEXT NULL,
  question_count INT NOT NULL DEFAULT 40,
  duration_minutes INT NOT NULL DEFAULT 20,
  pass_score DECIMAL(5,2) NOT NULL DEFAULT 80.00,
  max_official_attempts INT NOT NULL DEFAULT 1,
  allow_unlimited_practice TINYINT(1) NOT NULL DEFAULT 1,
  randomize_questions TINYINT(1) NOT NULL DEFAULT 1,
  randomize_answers TINYINT(1) NOT NULL DEFAULT 1,
  show_practice_answers TINYINT(1) NOT NULL DEFAULT 1,
  show_official_answers TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('draft','active','archived') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tests_code (code),
  KEY idx_tests_department (department_id),
  KEY idx_tests_status (status),
  CONSTRAINT fk_tests_department
    FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_tests_created_by
    FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS training_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(220) NOT NULL,
  material_type ENUM('pdf','image','slide','text','video','link') NOT NULL DEFAULT 'pdf',
  content_url VARCHAR(500) NULL,
  content_text MEDIUMTEXT NULL,
  department_id BIGINT UNSIGNED NULL,
  version_label VARCHAR(40) NOT NULL DEFAULT '1.0',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  uploaded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_materials_department (department_id),
  KEY idx_materials_active (is_active),
  CONSTRAINT fk_materials_department
    FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_materials_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_materials (
  test_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (test_id, material_id),
  CONSTRAINT fk_test_materials_test
    FOREIGN KEY (test_id) REFERENCES tests(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_test_materials_material
    FOREIGN KEY (material_id) REFERENCES training_materials(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  suggested_question_count INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_question_groups_test (test_id),
  CONSTRAINT fk_question_groups_test
    FOREIGN KEY (test_id) REFERENCES tests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NULL,
  question_text TEXT NOT NULL,
  explanation TEXT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'medium',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_questions_test (test_id, is_active),
  KEY idx_questions_group (group_id),
  CONSTRAINT fk_questions_test
    FOREIGN KEY (test_id) REFERENCES tests(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_questions_group
    FOREIGN KEY (group_id) REFERENCES question_groups(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_questions_created_by
    FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS answer_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  option_label CHAR(1) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_answer_options_label (question_id, option_label),
  KEY idx_answer_options_question (question_id),
  CONSTRAINT fk_answer_options_question
    FOREIGN KEY (question_id) REFERENCES questions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  test_id BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME NULL,
  status ENUM('not_started','studying','passed','failed') NOT NULL DEFAULT 'not_started',
  read_progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  practice_attempt_count INT NOT NULL DEFAULT 0,
  official_attempts_used INT NOT NULL DEFAULT 0,
  official_score DECIMAL(5,2) NULL,
  completed_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_test_assignments_employee_test (employee_id, test_id),
  KEY idx_assignments_status (status),
  KEY idx_assignments_test (test_id),
  CONSTRAINT fk_assignments_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assignments_test
    FOREIGN KEY (test_id) REFERENCES tests(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assignments_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  read_progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  first_viewed_at DATETIME NULL,
  last_viewed_at DATETIME NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_material_progress_employee_material (employee_id, material_id),
  CONSTRAINT fk_material_progress_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_material_progress_material
    FOREIGN KEY (material_id) REFERENCES training_materials(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  test_id BIGINT UNSIGNED NOT NULL,
  mode ENUM('practice','official') NOT NULL,
  attempt_no INT NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME NULL,
  time_spent_seconds INT NULL,
  total_questions INT NOT NULL DEFAULT 0,
  correct_answers INT NOT NULL DEFAULT 0,
  score DECIMAL(5,2) NULL,
  result_status ENUM('excellent','passed','review_required','failed') NULL,
  is_recorded TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_assignment (assignment_id),
  KEY idx_attempts_employee (employee_id),
  KEY idx_attempts_test_mode (test_id, mode),
  CONSTRAINT fk_attempts_assignment
    FOREIGN KEY (assignment_id) REFERENCES test_assignments(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_attempts_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_attempts_test
    FOREIGN KEY (test_id) REFERENCES tests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempt_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attempt_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  question_order INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_questions_order (attempt_id, question_order),
  UNIQUE KEY uq_attempt_questions_question (attempt_id, question_id),
  CONSTRAINT fk_attempt_questions_attempt
    FOREIGN KEY (attempt_id) REFERENCES test_attempts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_attempt_questions_question
    FOREIGN KEY (question_id) REFERENCES questions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempt_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attempt_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  selected_option_id BIGINT UNSIGNED NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_answers_attempt_question (attempt_id, question_id),
  CONSTRAINT fk_attempt_answers_attempt
    FOREIGN KEY (attempt_id) REFERENCES test_attempts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answers_question
    FOREIGN KEY (question_id) REFERENCES questions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answers_option
    FOREIGN KEY (selected_option_id) REFERENCES answer_options(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS retake_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  test_id BIGINT UNSIGNED NOT NULL,
  reason TEXT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_note TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_retake_status (status),
  CONSTRAINT fk_retake_assignment
    FOREIGN KEY (assignment_id) REFERENCES test_assignments(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_retake_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_retake_test
    FOREIGN KEY (test_id) REFERENCES tests(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_retake_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NULL,
  title VARCHAR(220) NOT NULL,
  body TEXT NOT NULL,
  type ENUM('assignment','material','result','retake','system') NOT NULL DEFAULT 'system',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_employee (employee_id, is_read),
  CONSTRAINT fk_notifications_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  category ENUM('login','material','test','retake','system') NOT NULL DEFAULT 'system',
  title VARCHAR(220) NOT NULL,
  content TEXT NOT NULL,
  status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  assigned_to BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_status (status),
  CONSTRAINT fk_support_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_support_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_employee_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_employee_id),
  KEY idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_actor
    FOREIGN KEY (actor_employee_id) REFERENCES employees(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW v_admin_results AS
SELECT
  ta.id AS assignment_id,
  e.id AS employee_id,
  e.full_name,
  e.phone,
  d.name AS department_name,
  e.position_title,
  e.hire_date,
  t.title AS test_title,
  ta.practice_attempt_count,
  ta.official_score,
  latest.time_spent_seconds,
  ta.status AS assignment_status,
  reviewer.full_name AS retake_reviewer
FROM test_assignments ta
JOIN employees e ON e.id = ta.employee_id
JOIN departments d ON d.id = e.department_id
JOIN tests t ON t.id = ta.test_id
LEFT JOIN (
  SELECT assignment_id, MAX(id) AS latest_attempt_id
  FROM test_attempts
  WHERE mode = 'official'
  GROUP BY assignment_id
) latest_id ON latest_id.assignment_id = ta.id
LEFT JOIN test_attempts latest ON latest.id = latest_id.latest_attempt_id
LEFT JOIN (
  SELECT assignment_id, MAX(reviewed_by) AS reviewed_by
  FROM retake_requests
  WHERE status = 'approved'
  GROUP BY assignment_id
) rr ON rr.assignment_id = ta.id
LEFT JOIN employees reviewer ON reviewer.id = rr.reviewed_by;
