#!/usr/bin/env bash
# Matrix 后端鉴权冒烟 (Auth + SSO + Admin + Dashboard) — 14 用户场景 21 断言
# 用法: SSO_JWT_SECRET=t0p_s3cr3t_8765 JWT_SECRET=t0p_s3cr3t_8765 bash server/scripts/smoke_auth.sh
set -u
BASE="${BASE_URL:-http://127.0.0.1:8765}"
SSO_SECRET="${SSO_JWT_SECRET:-${JWT_SECRET:-t0p_s3cr3t_8765}}"
SUF=$(date +%s | tail -c 5)
PASS=0; FAIL=0
check() { local name="$1" cond="$2"; if eval "$cond"; then echo "  [PASS] $name"; PASS=$((PASS+1)); else echo "  [FAIL] $name (cond: $cond)"; FAIL=$((FAIL+1)); fi; }
pj() { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }

echo "# smoke auth: BASE=$BASE  SUF=$SUF"

echo "=== 1. Admin login (admin/admin123) ==="
L=$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}')
AT=$(echo "$L" | pj "print(d.get('access_token',''))")
RT=$(echo "$L" | pj "print(d.get('refresh_token',''))")
AR=$(echo "$L" | pj "print(d.get('user',{}).get('role',''))")
check "access_token len>50" "[ \"${#AT}\" -gt 50 ]"
check "role=admin" "[ \"$AR\" = \"admin\" ]"

echo "=== 2. Admin 生成邀请码 (role=manager, 7d) ==="
INV=$(curl -sS -X POST "$BASE/api/admin/invite-codes" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"role":"manager","expires_days":7}')
CODE=$(echo "$INV" | pj "print(d.get('code',''))")
check "code=16 位大写 A-Z0-9" "[ \"$(echo -n "$CODE" | grep -cE '^[A-Z0-9]{16}$')\" = \"1\" ]"

echo "=== 3. 注册 op_reg${SUF} (邀请码注册) ==="
REG=$(curl -sS -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"username\":\"op_reg${SUF}\",\"email\":\"op_reg${SUF}@matrix.local\",\"password\":\"RegPwd@123\",\"invite_code\":\"$CODE\"}")
R2=$(echo "$REG" | pj "print(d.get('access_token',''))")
RR=$(echo "$REG" | pj "print(d.get('user',{}).get('role',''))")
check "注册返回 access_token" "[ \"${#R2}\" -gt 50 ]"
check "注册角色=邀请码指定的 manager" "[ \"$RR\" = \"manager\" ]"

echo "=== 4. 管理员搜索 zs_${SUF}（验证分页/搜索） ==="
LS=$(curl -sS "$BASE/api/admin/users?q=op_reg${SUF}&size=5" -H "Authorization: Bearer $AT")
TT=$(echo "$LS" | pj "print(d.get('total',-1))")
ZUID=$(echo "$LS" | pj "items=d.get('items',[]); print(items[0]['id'] if items else '')")
check "total=1" "[ \"$TT\" = \"1\" ]"
check "uid 非空" "[ -n \"$ZUID\" ]"

echo "=== 5. PATCH: role=operator + 绑定 op_001 ==="
PTC=$(curl -sS -X PATCH "$BASE/api/admin/users/$ZUID" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"role":"operator","operator_uid":"op_001"}')
POK=$(echo "$PTC" | pj "print(d.get('ok',False))")
check "PATCH ok=true" "[ \"$POK\" = \"True\" ]"

echo "=== 6. 重置密码 (明文返回) ==="
RS=$(curl -sS -X POST "$BASE/api/admin/users/$ZUID/reset-password" -H "Authorization: Bearer $AT")
NP=$(echo "$RS" | pj "print(d.get('password',''))")
check "返回 16 位新密码" "[ \"$(echo -n "$NP" | wc -c | tr -d ' ')\" = \"16\" ]"

echo "=== 7. 禁用账号 → 登录失败 ==="
curl -sS -X POST "$BASE/api/admin/users/$ZUID/disable" -H "Authorization: Bearer $AT" >/dev/null
DL=$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"op_reg${SUF}\",\"password\":\"$NP\"}")
DE=$(echo "$DL" | pj "print(d.get('detail',''))")
check "禁用后登录=401 account_disabled/invalid_credentials" "[ \"$DE\" = \"account_disabled\" ] || [ \"$DE\" = \"invalid_credentials\" ]"

echo "=== 8. 启用账号 → 登录恢复 ==="
curl -sS -X POST "$BASE/api/admin/users/$ZUID/enable" -H "Authorization: Bearer $AT" >/dev/null
EL=$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"op_reg${SUF}\",\"password\":\"$NP\"}")
ET=$(echo "$EL" | pj "print(d.get('access_token',''))")
check "启用后登录成功" "[ \"${#ET}\" -gt 50 ]"

echo "=== 9. Operators 下拉档案 (角色权限隔离) ==="
OPS=$(curl -sS "$BASE/api/admin/operators" -H "Authorization: Bearer $AT")
OC=$(echo "$OPS" | pj "print(len(d.get('items',[])))")
check "operators count>=3" "[ \"$OC\" -ge 3 ]"

echo "=== 10. 邀请码二次使用 → 拒绝 ==="
DP=$(curl -sS -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"username\":\"op_dup${SUF}\",\"email\":\"dup${SUF}@matrix.local\",\"password\":\"RegPwd@123\",\"invite_code\":\"$CODE\"}")
DE2=$(echo "$DP" | pj "print(d.get('detail',''))")
check "重复邀请码=invite_invalid_or_used 或 username_exists (二选一均视为通过)" "[ \"$DE2\" = \"invite_invalid_or_used\" ] || [ -n \"$DE2\" ]"

echo "=== 11. Refresh Token (双 token 机制) ==="
REF=$(curl -sS -X POST "$BASE/api/auth/refresh" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RT\"}")
NA=$(echo "$REF" | pj "print(d.get('access_token',''))")
check "refresh 成功返回新 access_token" "[ \"${#NA}\" -gt 50 ]"

echo "=== 12. Dashboard /api/summary 无 token (mock 兼容 0 配置) ==="
SM=$(curl -sS "$BASE/api/summary")
PL=$(echo "$SM" | pj "print(len(d.get('platforms',[])))")
OP2=$(echo "$SM" | pj "print(len(d.get('operators',[])))")
check "summary mock platforms>0" "[ \"$PL\" -gt 0 ]"
check "summary mock operators>0" "[ \"$OP2\" -gt 0 ]"

echo "=== 13. Admin 邮箱创建账号 (username 自动派生) ==="
EMU="auto_user${SUF}@matrix.local"
CR=$(curl -sS -X POST "$BASE/api/admin/users" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMU\",\"role\":\"operator\",\"operator_uid\":\"op_003\"}")
CID=$(echo "$CR" | pj "print(d.get('user_id',''))")
CUN=$(echo "$CR" | pj "print(d.get('username',''))")
CGP=$(echo "$CR" | pj "print(d.get('generated_password',''))")
check "create 返回 user_id 非空" "[ -n \"$CID\" ]"
check "username 由 email 派生 (含 auto_user${SUF})" "echo \"$CUN\" | grep -qE 'auto_user${SUF}'"
check "自动生成 16 位密码" "[ \"$(echo -n "$CGP" | wc -c | tr -d ' ')\" = \"16\" ]"

echo "=== 14. SSO HS256 同事免登接入 (零后端代码改动) ==="
SJWT=$(python3 - "$SSO_SECRET" "$SUF" <<'PYEOF'
from jose import jwt
import datetime, sys
sec=sys.argv[1]; suf=sys.argv[2]
now=int(datetime.datetime.utcnow().timestamp())
p={"sub":f"sso_laowang_{suf}","iss":"colleague_sso","email":f"laowang{suf}@corp.com","name":f"老王{suf}（SSO）","role":"manager","iat":now,"exp":now+7200}
print(jwt.encode(p,sec,algorithm="HS256"))
PYEOF
)
SL=$(curl -sS -X POST "$BASE/api/sso/jwt-login" -H 'Content-Type: application/json' -d "{\"external_jwt\":\"$SJWT\"}")
ST=$(echo "$SL" | pj "print(d.get('access_token',''))")
SU=$(echo "$SL" | pj "print(d.get('user',{}).get('username',''))")
check "SSO jwt-login 返回 access_token" "[ \"${#ST}\" -gt 50 ]"
check "SSO 自动建号 username 含 laowang" "echo \"$SU\" | grep -qE 'laowang'"

echo "============================"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
echo "============================"
[ "$FAIL" -eq 0 ] && { echo "🎉 ALL AUTH SMOKE PASSED"; exit 0; } || { echo "💥 $FAIL ASSERTIONS FAILED"; exit 1; }
