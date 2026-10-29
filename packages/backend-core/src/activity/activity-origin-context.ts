import { AsyncLocalStorage } from "node:async_hooks";

type ActivityOriginContext = {
  origin: string;
};

const activityOriginStorage = new AsyncLocalStorage<ActivityOriginContext>();

export function getActivityOrigin(defaultOrigin = "activity"): string {
  return activityOriginStorage.getStore()?.origin ?? defaultOrigin;
}

export function runWithActivityOrigin<T>(origin: string, callback: () => T): T {
  return activityOriginStorage.run({ origin }, callback);
}
