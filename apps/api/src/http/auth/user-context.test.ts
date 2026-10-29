import { describe, expect, it } from "vitest";

import { getRequiredActorUserId } from "./user-context";

describe("user context", () => {
  it("does not authenticate requests from x-user-id headers", () => {
    const req = {
      header(name: string) {
        return name.toLowerCase() === "x-user-id" ? "11111111-1111-4111-8111-111111111111" : undefined;
      },
    };

    expect(() => getRequiredActorUserId(req as never)).toThrow("Authentication session is required");
  });

  it("uses the session actor from auth middleware", () => {
    const req = {
      actorUserId: "11111111-1111-4111-8111-111111111111",
    };

    expect(getRequiredActorUserId(req as never)).toBe("11111111-1111-4111-8111-111111111111");
  });
});
