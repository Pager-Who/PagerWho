import { Router } from "express";

import { getCalendarFeedIcsHandler } from "../handlers/calendar-feed.handler";

export const calendarFeedsRoutes = Router();

calendarFeedsRoutes.get("/:token/on-call.ics", getCalendarFeedIcsHandler);
