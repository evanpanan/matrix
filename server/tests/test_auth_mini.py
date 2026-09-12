"""
test_auth_mini.py - Matrix 后端鉴权最小单元测试 (5 tests)
运行方式: cd server && python3 -m pytest tests/test_auth_mini.py -v 或 python3 tests/test_auth_mini.py
"""
import sys, os, time, unittest, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

os.environ.setdefault("JWT_SECRET", "test_s3cr3t_unit_999")
os.environ.setdefault("SSO_JWT_SECRET", os.environ["JWT_SECRET"])

import main as M

USERNAME_RE = M.USERNAME_RE
EMAIL_RE = M.EMAIL_RE


class TestBcryptRoundtrip(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(M._bcrypt, "bcrypt 未安装，pip install -r requirements.txt")

    def test_short_pw_32(self):
        pw = "ShortPw@123"  # 11 chars
        h = M.hash_password(pw)
        self.assertTrue(M.verify_password(pw, h))
        self.assertFalse(M.verify_password("WrongPw@123", h))

    def test_exact_72_bytes(self):
        pw = "a" * 72
        h = M.hash_password(pw)
        self.assertTrue(M.verify_password(pw, h))
        self.assertFalse(M.verify_password("a" * 71 + "b", h))

    def test_over_72_bytes_uses_sha256(self):
        pw = "x" * 100
        h = M.hash_password(pw)
        self.assertTrue(M.verify_password(pw, h))
        self.assertFalse(M.verify_password("x" * 99 + "y", h))


class TestJwtRoundtrip(unittest.TestCase):
    def test_sign_and_decode_roundtrip(self):
        sub = "u_test_1234"
        token = M.sign_jwt({"sub": sub, "typ": "access", "role": "manager"}, 30)
        self.assertIsInstance(token, str) and self.assertGreater(len(token), 20)
        payload = M.decode_jwt(token, os.environ["JWT_SECRET"], "HS256")
        self.assertEqual(payload["sub"], sub)
        self.assertEqual(payload["role"], "manager")

    def test_expired_token_rejected(self):
        token = M.sign_jwt({"sub": "u_exp", "typ": "access", "role": "operator"}, -5)
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            M.decode_jwt(token, os.environ["JWT_SECRET"], "HS256")
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("ExpiredSignatureError", str(ctx.exception.detail))


class TestRoleBasedAccessControl(unittest.TestCase):
    """FastAPI TestClient 做 HTTP 层 RBAC 断言"""
    @classmethod
    def setUpClass(cls):
        try:
            from fastapi.testclient import TestClient
        except Exception as e:
            raise unittest.SkipTest(f"fastapi testclient 不可用 ({e})")
        # 清理已有 test DB (独立文件避免与主 db 冲突)
        cls._orig_db = M.DB_PATH
        cls._tmp_db = pathlib.Path(__file__).resolve().parent / "_test_auth_tmp.db"
        if cls._tmp_db.exists(): cls._tmp_db.unlink()
        M.DB_PATH = cls._tmp_db
        M.init_db()
        # 刷新 app state
        M.app.dependency_overrides.clear()
        cls.client = TestClient(M.app)
        # op_user 账号: 创建 operator role user
        cls._seed(cls)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "_tmp_db") and cls._tmp_db.exists():
            cls._tmp_db.unlink()
        M.DB_PATH = cls._orig_db

    def _seed(self):
        with M.get_conn() as c:
            c.execute(
                "INSERT OR IGNORE INTO users(id,username,email,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))",
                ("u_op_rbac", "op_rbac", "rbac@matrix.local", M.hash_password("RbacPwd@123"), "operator", "active"),
            )
            # admin 账号如果不存在（init_db 里已经 seed admin，这里确认密码正确）
            if not c.execute("SELECT 1 FROM users WHERE username='admin'").fetchone():
                c.execute(
                    "INSERT INTO users(id,username,email,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))",
                    ("u_admin_rbac", "admin", "admin@matrix.local", M.hash_password("admin123"), "admin", "active"),
                )

    def _login(self, u, p):
        r = self.client.post("/api/auth/login", json={"username": u, "password": p})
        self.assertEqual(r.status_code, 200, f"login failed {r.status_code}: {r.text}")
        return r.json()["access_token"]

    def test_operator_cannot_access_admin_users_endpoint_403(self):
        tok = self._login("op_rbac", "RbacPwd@123")
        r = self.client.get("/api/admin/users", headers={"Authorization": f"Bearer {tok}"})
        self.assertEqual(r.status_code, 403, f"operator 访问 admin 应 403，但得到 {r.status_code}: {r.text}")

    def test_admin_can_access_admin_users_200(self):
        tok = self._login("admin", "admin123")
        r = self.client.get("/api/admin/users", headers={"Authorization": f"Bearer {tok}"})
        self.assertEqual(r.status_code, 200, f"admin 访问 users 应 200，但得到 {r.status_code}: {r.text}")
        self.assertIn("items", r.json())


if __name__ == "__main__":
    unittest.main(verbosity=2)
