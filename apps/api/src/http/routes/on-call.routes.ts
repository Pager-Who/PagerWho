import { Router } from "express";

import {
  createOnCallOverrideHandler,
  createOnCallScheduleHandler,
  deleteOnCallOverrideHandler,
  deleteOnCallScheduleHandler,
  getCurrentOnCallHandler,
  getOnCallScheduleHandler,
  listOnCallSchedulesHandler,
  previewOnCallScheduleHandler,
  updateOnCallScheduleHandler,
} from "../handlers/on-call.handler";

export const onCallRoutes = Router();

onCallRoutes.get("/", getCurrentOnCallHandler);
onCallRoutes.get("/schedules", listOnCallSchedulesHandler);
onCallRoutes.post("/schedules", createOnCallScheduleHandler);
onCallRoutes.get("/schedules/:scheduleId", getOnCallScheduleHandler);
onCallRoutes.get("/schedules/:scheduleId/preview", previewOnCallScheduleHandler);
onCallRoutes.put("/schedules/:scheduleId", updateOnCallScheduleHandler);
onCallRoutes.delete("/schedules/:scheduleId", deleteOnCallScheduleHandler);
onCallRoutes.post("/overrides", createOnCallOverrideHandler);
onCallRoutes.delete("/overrides/:overrideId", deleteOnCallOverrideHandler);
