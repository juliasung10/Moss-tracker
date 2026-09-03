import { describe, expect, it } from "vitest";
import { sslConfig } from "./db.ts";

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
