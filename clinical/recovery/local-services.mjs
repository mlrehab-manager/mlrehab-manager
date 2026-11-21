import { spawnSync } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
import { createServer } from "node:http";
export const images = {
  postgres:
    "postgres@sha256:a77aa70e641402a21411b92b721c58d10f23b50ae5fdd2333efd22d166e1e5f7",
  auth: "public.ecr.aws/supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b",
  rest: "public.ecr.aws/supabase/postgrest@sha256:1347d7552b88f17832912c06afbf7c43209af6eeeb60834b04aae12c9bd9d5cc",
};
const redactions = new Set();
const docker = (args, input, env = {}) => {
  const r = spawnSync("docker", args, {
    input,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  });
  if (r.status !== 0) {
    let detail = r.stderr ?? "";
    for (const secret of redactions)
      detail = detail.split(secret).join("[redacted]");
    throw new Error(
      `Docker operation failed (${args[0]}): ${detail.slice(-1500)}`,
    );
  }
  return r.stdout.trim();
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export async function startServices(label) {
  if (!["source", "target"].includes(label))
    throw new Error("Invalid local fixture");
  const prefix = `mlrehab-recovery-${label}`,
    network = prefix,
    db = `${prefix}-db`,
    auth = `${prefix}-auth`,
    rest = `${prefix}-rest`,
    password = randomBytes(24).toString("hex"),
    jwt = randomBytes(32).toString("hex");
  let proxy;
  redactions.add(password);
  redactions.add(jwt);
  const cleanup = async () => {
    if (proxy) await new Promise((r) => proxy.close(r));
    for (const name of [rest, auth, db])
      try {
        docker(["rm", "-f", "-v", name]);
      } catch {}
    try {
      docker(["network", "rm", network]);
    } catch {}
  };
  const psql = (sql) =>
    docker(
      [
        "exec",
        "-i",
        db,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-tA",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=sqlstate",
      ],
      sql,
    );
  try {
    docker(["network", "create", network]);
    docker(
      [
        "run",
        "-d",
        "--name",
        db,
        "--network",
        network,
        "--env",
        "POSTGRES_PASSWORD",
        images.postgres,
      ],
      undefined,
      { POSTGRES_PASSWORD: password },
    );
    for (let i = 0; ; i++) {
      try {
        // The image uses a temporary socket-only server during initdb. Wait for the final TCP listener.
        docker(["exec", db, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
        break;
      } catch {
        if (i >= 45) throw new Error("Postgres fixture did not start");
        await pause(500);
      }
    }
    psql(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role authenticator noinherit login password '${password}';grant anon,authenticated,service_role to authenticator;create role supabase_auth_admin noinherit login createrole password '${password}';create schema auth authorization supabase_auth_admin;alter role supabase_auth_admin set search_path=auth,public;create extension if not exists pgcrypto;create extension if not exists "uuid-ossp";grant usage on schema public to supabase_auth_admin;`,
    );
    const encode = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    function key(role) {
      const part =
        encode({ alg: "HS256", typ: "JWT" }) +
        "." +
        encode({
          iss: "supabase",
          role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        });
      return (
        part + "." + createHmac("sha256", jwt).update(part).digest("base64url")
      );
    }
    const anonKey = key("anon"),
      serviceKey = key("service_role");
    let authUrl, restUrl;
    proxy = createServer(async (req, res) => {
      try {
        if (
          req.headers.apikey !== anonKey &&
          req.headers.apikey !== serviceKey
        ) {
          res.writeHead(401);
          res.end("{}");
          return;
        }
        const path = req.url ?? "",
          isAuth = path.startsWith("/auth/v1/"),
          isRest = path.startsWith("/rest/v1/");
        if (!isAuth && !isRest) {
          res.writeHead(404);
          res.end();
          return;
        }
        let body = "";
        for await (const chunk of req) body += chunk;
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.connection;
        const response = await fetch(
          (isAuth ? authUrl : restUrl) +
            path.replace(isAuth ? "/auth/v1" : "/rest/v1", ""),
          {
            method: req.method,
            headers,
            body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
          },
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(502);
        res.end("{}");
      }
    });
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${proxy.address().port}`;
    const env = {
      DB_NAMESPACE: "auth",
      GOTRUE_DB_NAMESPACE: "auth",
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@${db}:5432/postgres?sslmode=disable`,
      GOTRUE_JWT_SECRET: jwt,
      GOTRUE_JWT_AUD: "authenticated",
      GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
      GOTRUE_SITE_URL: url,
      API_EXTERNAL_URL: url,
      GOTRUE_API_HOST: "0.0.0.0",
      GOTRUE_API_PORT: "9999",
      GOTRUE_DISABLE_SIGNUP: "true",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_MAILER_AUTOCONFIRM: "false",
      GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true",
      GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true",
      GOTRUE_LOG_LEVEL: "error",
    };
    docker(
      [
        "run",
        "-d",
        "--name",
        auth,
        "--network",
        network,
        "-p",
        "127.0.0.1::9999",
        ...Object.keys(env).flatMap((k) => ["--env", k]),
        images.auth,
      ],
      undefined,
      env,
    );
    authUrl = "http://" + docker(["port", auth, "9999/tcp"]);
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(authUrl + "/health")).ok) break;
      } catch {}
      if (
        docker(["inspect", "--format", "{{.State.Status}}", auth]) === "exited"
      ) {
        const logs = spawnSync("docker", ["logs", "--tail", "8", auth], {
          encoding: "utf8",
        });
        const safe = (logs.stdout + logs.stderr)
          .split(password)
          .join("[redacted]")
          .split(jwt)
          .join("[redacted]")
          .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[database URL]");
        throw new Error("Auth fixture exited: " + safe);
      }
      if (i >= 60) throw new Error("Auth fixture did not start");
      await pause(500);
    }
    psql("grant usage on schema auth to anon,authenticated,service_role;");
    const renv = {
      PGRST_DB_URI: `postgres://authenticator:${password}@${db}:5432/postgres`,
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: jwt,
      PGRST_LOG_LEVEL: "crit",
    };
    docker(
      [
        "run",
        "-d",
        "--name",
        rest,
        "--network",
        network,
        "-p",
        "127.0.0.1::3000",
        ...Object.keys(renv).flatMap((k) => ["--env", k]),
        images.rest,
      ],
      undefined,
      renv,
    );
    restUrl = "http://" + docker(["port", rest, "3000/tcp"]);
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(restUrl + "/")).ok) break;
      } catch {}
      if (i >= 40) throw new Error("REST fixture did not start");
      await pause(500);
    }
    return {
      url,
      anonKey,
      serviceKey,
      psql,
      cleanup,
      reload: async () => {
        psql("notify pgrst,'reload schema';");
        await pause(500);
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
