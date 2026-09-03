import { describe, expect, it } from "vitest";
import { prepareConnection, sslConfig } from "./db.ts";

/**
 * These follow libpq's sslmode semantics. The one that matters in practice:
 * `require` encrypts but does NOT verify the server's identity — managed providers
 * commonly present their own CA, and verifying by default rejects them with
 * "self-signed certificate in certificate chain".
 */
describe("ssl configuration", () => {
  it("encrypts without verifying for sslmode=require", () => {
    expect(sslConfig("postgres://u:p@db.supabase.co:6543/postgres?sslmode=require")).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("does the same when no sslmode is given on a hosted database", () => {
    expect(sslConfig("postgres://u:p@db.supabase.co:6543/postgres")).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("verifies the chain only when explicitly asked", () => {
    expect(sslConfig("postgres://u:p@db.co/x?sslmode=verify-full")).toEqual({
      rejectUnauthorized: true,
    });
    expect(sslConfig("postgres://u:p@db.co/x?sslmode=verify-ca")).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("turns TLS off entirely for sslmode=disable", () => {
    expect(sslConfig("postgres://u:p@db.co/x?sslmode=disable")).toBe(false);
  });

  it("leaves a plain local connection alone", () => {
    expect(sslConfig("postgres://u:p@localhost:5432/x")).toBeUndefined();
    expect(sslConfig("postgres://u:p@127.0.0.1:5432/x")).toBeUndefined();
  });

  it("still encrypts a local connection when asked to", () => {
    expect(sslConfig("postgres://u:p@localhost:5432/x?sslmode=require")).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("does not throw on a malformed connection string", () => {
    expect(() => sslConfig("not a url")).not.toThrow();
  });
});

/**
 * node-postgres lets sslmode in the connection string override an explicit `ssl`
 * option, and currently treats `require` as `verify-full`. These cover the strip
 * that stops our settings being silently discarded.
 */
describe("connection preparation", () => {
  it("removes sslmode so our own TLS settings survive", () => {
    const prepared = prepareConnection(
      "postgres://u:p@db.pooler.supabase.com:6543/postgres?sslmode=require",
    );
    expect(prepared.connectionString).not.toContain("sslmode");
    expect(prepared.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("keeps the host, port, database and every other parameter", () => {
    const prepared = prepareConnection(
      "postgres://u:p@db.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true",
    );
    expect(prepared.connectionString).toContain("db.pooler.supabase.com:6543");
    expect(prepared.connectionString).toContain("/postgres");
    expect(prepared.connectionString).toContain("pgbouncer=true");
  });

  it("still verifies when verify-full was asked for", () => {
    expect(prepareConnection("postgres://u:p@db.co/x?sslmode=verify-full").ssl).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("leaves an unparseable string untouched rather than mangling it", () => {
    const weird = "not a url";
    expect(prepareConnection(weird).connectionString).toBe(weird);
  });
});
