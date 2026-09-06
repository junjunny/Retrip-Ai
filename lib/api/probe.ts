/**
 * Layered connectivity probe: DNS → TCP → TLS, per host, with timing.
 *
 * Purpose: on a deployed server, one call tells you *exactly* which layer fails
 * for `apis.data.go.kr` — TCP refused/timeout vs TLS ClientHello hang vs OK.
 * Distinguishes NETWORK_BLOCKED / TLS_ERROR from an API-level problem.
 *
 * SERVER ONLY (uses node:net / node:tls). No secrets involved.
 */
import "server-only";

import { lookup } from "node:dns/promises";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

export interface LayerResult {
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
}

export interface HostProbe {
  host: string;
  port: number;
  dns: LayerResult;
  tcp: LayerResult;
  tls: LayerResult;
  /** first layer that failed, or null if all passed */
  blockedAt: "dns" | "tcp" | "tls" | null;
}

const now = () => performance.now();

async function probeDns(host: string, timeoutMs: number): Promise<LayerResult & { address?: string }> {
  const t = now();
  try {
    const res = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("dns timeout")), timeoutMs)),
    ]);
    const addrs = res.map((r) => r.address);
    return { ok: true, ms: Math.round(now() - t), detail: addrs.join(", "), address: addrs[0] };
  } catch (e) {
    return { ok: false, ms: Math.round(now() - t), error: e instanceof Error ? e.message : "dns failed" };
  }
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<LayerResult> {
  return new Promise((resolve) => {
    const t = now();
    const sock = netConnect({ host, port });
    const done = (r: LayerResult) => {
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done({ ok: true, ms: Math.round(now() - t) }));
    sock.once("timeout", () => done({ ok: false, ms: Math.round(now() - t), error: "tcp connect timeout" }));
    sock.once("error", (e) => done({ ok: false, ms: Math.round(now() - t), error: e.message }));
  });
}

function probeTls(host: string, port: number, timeoutMs: number): Promise<LayerResult> {
  return new Promise((resolve) => {
    const t = now();
    const sock = tlsConnect({ host, port, servername: host, rejectUnauthorized: false });
    const done = (r: LayerResult) => {
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs);
    sock.once("secureConnect", () =>
      done({ ok: true, ms: Math.round(now() - t), detail: sock.getProtocol() ?? undefined }),
    );
    sock.once("timeout", () =>
      done({ ok: false, ms: Math.round(now() - t), error: "tls handshake timeout (no ServerHello)" }),
    );
    sock.once("error", (e) => done({ ok: false, ms: Math.round(now() - t), error: e.message }));
  });
}

export async function probeHost(
  host: string,
  port = 443,
  timeoutMs = 8000,
): Promise<HostProbe> {
  const dns = await probeDns(host, timeoutMs);
  if (!dns.ok) {
    return { host, port, dns, tcp: skip(), tls: skip(), blockedAt: "dns" };
  }
  const tcp = await probeTcp(host, port, timeoutMs);
  if (!tcp.ok) {
    return { host, port, dns, tcp, tls: skip(), blockedAt: "tcp" };
  }
  const tls = await probeTls(host, port, timeoutMs);
  return { host, port, dns, tcp, tls, blockedAt: tls.ok ? null : "tls" };
}

const skip = (): LayerResult => ({ ok: false, ms: 0, detail: "skipped (earlier layer failed)" });
