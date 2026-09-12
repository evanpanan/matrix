import sys
import main

tok = sys.argv[1]
uid = sys.argv[2]
print("ENV_JWT_SECRET first 5:", main.ENV_JWT_SECRET[:5])
try:
    p = main.decode_jwt(tok)
    print("payload sub=", p.get("sub"), " uid=", uid, " match=", p.get("sub") == uid)
    print("payload typ=", p.get("typ"), " role=", p.get("role"))
except Exception as e:
    print("decode FAIL:", type(e).__name__, str(e)[:300])

u = main._get_token_user(tok)
print("_get_token_user user:", None if u is None else (u["id"]+"/"+str(u["role"])))

with main.get_conn() as c:
    r = c.execute("SELECT id,username,status,role,operator_uid FROM users WHERE id=?", (uid,)).fetchone()
    print("direct SQL:", dict(r) if r else None)
    r2 = c.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    print("users count:", r2["n"])
