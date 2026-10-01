import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { runWithRequestContext } from "@todo/common";
import { createRegistrationController } from "../registration.controller.js";
import type { RegistrationService } from "../registration.service.js";

describe("registration controller API compatibility (EV-7)", () => {
  it("returns legacy flat data fields and the current nested user shape", async () => {
    const registeredUser = {
      id: "4d395a15-853a-4d2f-93d5-041868663cd2",
      email: "alice@example.com",
      createdAt: "2026-10-01T10:00:00.000Z",
    };
    const register = vi.fn().mockResolvedValue(registeredUser);
    const service = { register } as unknown as RegistrationService;
    const status = vi.fn();
    const json = vi.fn();
    const response = { status, json } as unknown as Response;
    status.mockReturnValue(response);

    const controller = createRegistrationController(service);
    const request = {
      body: { email: registeredUser.email, password: "not-returned" },
    } as Request;

    await runWithRequestContext(
      {
        requestId: "c76546ac-e520-4be1-a6cb-e03b31813ec3",
        serviceName: "account-service",
      },
      () => controller(request, response, vi.fn()),
    );

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({
      data: {
        ...registeredUser,
        user: registeredUser,
      },
    });
    expect(json.mock.calls[0]?.[0]).not.toHaveProperty("data.password");
  });
});
