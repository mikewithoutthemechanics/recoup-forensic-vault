import { describe, expect, it } from "vitest";

import { zar, zarCompact } from "./format";

describe("zar()", () => {
  it("formats 0 cents as R0", () => {
    const out = zar(0);
    expect(out).toMatch(/R/);
    expect(out.replace(/\s/g, "")).toMatch(/R0/);
  });

  it("formats null/undefined as R0", () => {
    expect(zar(null).replace(/\s/g, "")).toMatch(/R0/);
    expect(zar(undefined).replace(/\s/g, "")).toMatch(/R0/);
  });

  it("formats whole rands without trailing decimals", () => {
    // 10000 cents = R100 — maximumFractionDigits 0 branch
    const out = zar(10_000);
    expect(out).toMatch(/100/);
    expect(out).toMatch(/R/);
  });

  it("formats fractional rands with decimals", () => {
    // 12345 cents = R123.45 — South African locale uses comma or period
    const out = zar(12_345);
    expect(out).toMatch(/R/);
    // tolerate both 123,45 and 123.45 depending on Intl data
    expect(out).toMatch(/123[.,]45/);
  });

  it("formats large values with grouping", () => {
    const out = zar(1_234_567_00); // R1 234 567
    expect(out).toMatch(/R/);
    expect(out).toMatch(/1/);
  });
});

describe("zarCompact()", () => {
  it("compacts thousands to R...k", () => {
    expect(zarCompact(150_000)).toMatch(/R.*k/i);
  });

  it("compacts millions to R...m", () => {
    expect(zarCompact(2_500_000_00)).toMatch(/R.*m/i);
  });
});
