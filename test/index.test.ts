import { expect } from "chai";
import { grantDatacap, registerAllocator } from "./utils/filecoin";

describe("Example Test Suite", () => {
  it("should correctly add two numbers", () => {
    const num1 = 1;
    const num2 = 2;
    const sum = num1 + num2;
    expect(sum).to.equal(3);
  });

  it("fgoirnof", async () => {
    const result = await grantDatacap(
      "t01002",
      "t3wy6hl4mlkdfcsv4urbelf7wtbbhkopkod7m2zbm3yyfhdvvdts2tmsolj3cwqjoivbo4cp5b47ox3xi6v4xa",
      10000000
    );
  });
});
