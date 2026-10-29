import { describe, expect, it } from "vitest";

import { OnCallService } from "./on-call.service";

type RotationInput = {
  rotationType: string;
  rotationInterval: number;
  startsAt: Date;
  timezone: string;
  participants: {
    userId: string;
    position: number;
  }[];
};

type RotationPicker = {
  pickRotationParticipant(rotation: RotationInput, at: Date): string;
};

const service = new OnCallService({} as never) as unknown as RotationPicker;

describe("OnCallService rotation calculations", () => {
  it("rotates daily by local calendar day across DST boundaries", () => {
    const rotation = rotationInput({
      rotationType: "daily",
      rotationInterval: 1,
      startsAt: "2026-03-08T05:00:00.000Z",
      timezone: "America/New_York",
    });

    const userId = service.pickRotationParticipant(rotation, new Date("2026-03-09T04:30:00.000Z"));

    expect(userId).toBe("user-b");
  });

  it("treats custom rotation intervals as hours", () => {
    const rotation = rotationInput({
      rotationType: "custom",
      rotationInterval: 12,
      startsAt: "2026-01-01T00:00:00.000Z",
      timezone: "UTC",
    });

    const userId = service.pickRotationParticipant(rotation, new Date("2026-01-01T13:00:00.000Z"));

    expect(userId).toBe("user-b");
  });
});

function rotationInput(input: {
  rotationType: string;
  rotationInterval: number;
  startsAt: string;
  timezone: string;
}): RotationInput {
  return {
    rotationType: input.rotationType,
    rotationInterval: input.rotationInterval,
    startsAt: new Date(input.startsAt),
    timezone: input.timezone,
    participants: [
      {
        userId: "user-a",
        position: 0,
      },
      {
        userId: "user-b",
        position: 1,
      },
    ],
  };
}
