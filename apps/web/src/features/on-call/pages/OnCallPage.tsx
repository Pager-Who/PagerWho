import type {
  DateSelectArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import koLocale from "@fullcalendar/core/locales/ko";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  OnCallOverride,
  OnCallLayer,
  OnCallPreviewEntry,
  OnCallSchedulePreview,
  OnCallRotation,
  OnCallSchedule,
  Service,
  Team,
  User,
} from "@im/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  NumberInput,
  PageHeader,
  Panel,
  SectionHeader,
  Select,
  TablePageSkeleton,
  TabButton,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { useAuth } from "../../../shared/auth";
import { LocalizedText, normalizeLocale } from "../../../shared/i18n";
import { formatDateTime, formatRelativeTime, shortId } from "../../../shared/utils";
import {
  useCreateOnCallOverrideMutation,
  useCreateOnCallScheduleMutation,
  useDeleteOnCallScheduleMutation,
  useDeleteOnCallOverrideMutation,
  useOnCallSchedulePreview,
  useOnCallSchedules,
  useOnCallServices,
  useOnCallTeams,
  useOnCallUsers,
  useOnCallWorkspaceMembers,
  useUpdateOnCallScheduleMutation,
} from "../queries";

type OnCallTab = "schedules" | "overrides" | "new-schedule";
type CalendarPreviewMode = "week" | "month";
type OverrideStatus = "active" | "ended" | "upcoming";
type OverrideCreationMode = "schedule" | "user";
type UserOverrideLayer = OnCallLayer | "both";

type ScheduleFormState = {
  name: string;
  primaryUserIds: string[];
  rotationInterval: number;
  rotationType: OnCallRotation["rotation_type"];
  secondaryUserIds: string[];
  startsAt: string;
  timezone: string;
};

type OverrideFormState = {
  endsAt: string;
  layer: OnCallLayer;
  scheduleId: string;
  startsAt: string;
  userId: string;
};

type UserOverrideFormState = {
  endsAt: string;
  layer: UserOverrideLayer;
  replacementUserId: string;
  startsAt: string;
  unavailableUserId: string;
};

type UserOverridePlan = {
  endsAt: string;
  layer: OnCallLayer;
  scheduleId: string;
  startsAt: string;
};

type CalendarOverrideRange = {
  endsAt: string;
  layer: OnCallLayer;
  startsAt: string;
};

export function OnCallPage() {
  const { projectId } = useAuth();
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const [activeTab, setActiveTab] = useState<OnCallTab>("schedules");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [editScheduleForm, setEditScheduleForm] = useState<ScheduleFormState | null>(null);
  const [previewAnchorDate, setPreviewAnchorDate] = useState(() => new Date());
  const [previewMode, setPreviewMode] = useState<CalendarPreviewMode>("week");
  const [overrideCreationMode, setOverrideCreationMode] = useState<OverrideCreationMode>("schedule");
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => createBlankScheduleForm());
  const [overrideForm, setOverrideForm] = useState<OverrideFormState>({
    endsAt: toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)),
    layer: "primary" as OnCallLayer,
    scheduleId: "",
    startsAt: toLocalInputValue(new Date()),
    userId: "",
  });
  const [userOverrideForm, setUserOverrideForm] = useState<UserOverrideFormState>(() => createBlankUserOverrideForm());
  const [detailOverrideForm, setDetailOverrideForm] = useState<OverrideFormState | null>(null);
  const [isDeleteScheduleDialogOpen, setIsDeleteScheduleDialogOpen] = useState(false);
  const [calendarSelectionResetKey, setCalendarSelectionResetKey] = useState(0);
  const schedulesQuery = useOnCallSchedules();
  const servicesQuery = useOnCallServices();
  const teamsQuery = useOnCallTeams();
  const usersQuery = useOnCallUsers();
  const workspaceMembersQuery = useOnCallWorkspaceMembers();
  const createScheduleMutation = useCreateOnCallScheduleMutation();
  const deleteScheduleMutation = useDeleteOnCallScheduleMutation();
  const updateScheduleMutation = useUpdateOnCallScheduleMutation();
  const createOverrideMutation = useCreateOnCallOverrideMutation();
  const createUserOverrideMutation = useCreateOnCallOverrideMutation();
  const deleteOverrideMutation = useDeleteOnCallOverrideMutation();

  const schedules = schedulesQuery.data ?? [];
  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId) ?? schedules[0] ?? null;
  const previewWindow = useMemo(() => createCalendarPreviewWindow(previewMode, previewAnchorDate), [previewAnchorDate, previewMode, selectedSchedule?.id]);
  const previewQuery = useOnCallSchedulePreview(activeTab === "schedules" ? selectedSchedule?.id : undefined, previewWindow);
  const services = servicesQuery.data?.items ?? [];
  const teams = teamsQuery.data ?? [];
  const allUsers = usersQuery.data ?? [];
  const workspaceMemberUserIds = useMemo(
    () => new Set((workspaceMembersQuery.data ?? []).map((member) => member.user_id)),
    [workspaceMembersQuery.data],
  );
  const users = useMemo(
    () => allUsers.filter((user) => workspaceMemberUserIds.has(user.id)),
    [allUsers, workspaceMemberUserIds],
  );
  const overrideScheduleId = overrideForm.scheduleId || selectedSchedule?.id || "";
  const overrideSchedule = schedules.find((schedule) => schedule.id === overrideScheduleId) ?? null;
  const overrideExcludedUserIds = useMemo(
    () => overrideSchedule ? collectAssignedUserIdsForOverride(overrideSchedule, overrideForm) : new Set<string>(),
    [overrideForm, overrideSchedule],
  );
  const overrideExcludedUserKey = useMemo(() => createUserIdSetKey(overrideExcludedUserIds), [overrideExcludedUserIds]);
  const overrideSelectableUsers = useMemo(
    () => users.filter((user) => !overrideExcludedUserIds.has(user.id)),
    [overrideExcludedUserKey, users],
  );
  const userOverrideReplacementUsers = useMemo(
    () => users.filter((user) => user.id !== userOverrideForm.unavailableUserId),
    [userOverrideForm.unavailableUserId, users],
  );
  const userOverridePlans = useMemo(
    () => createUserOverridePlans(schedules, userOverrideForm),
    [schedules, userOverrideForm],
  );

  const teamNameById = useMemo(() => createTeamNameMap(teams), [teams]);
  const serviceNameById = useMemo(() => createServiceNameMap(services), [services]);
  const userNameById = useMemo(() => createUserNameMap(allUsers), [allUsers]);
  const overrides = useMemo(() => collectOverrides(schedules), [schedules]);
  const summary = useMemo(() => createOnCallSummary(schedules, overrides), [overrides, schedules]);
  const overrideColumns = useMemo<Array<DataTableColumn<OnCallOverride>>>(
    () => createOverrideColumns({
      deletingId: deleteOverrideMutation.variables,
      isDeleting: deleteOverrideMutation.isPending,
      onDelete: (override) => deleteOverrideMutation.mutate(override.id),
      schedules,
      userNameById,
    }),
    [deleteOverrideMutation, schedules, userNameById],
  );
  const isLoading = schedulesQuery.isLoading
    || servicesQuery.isLoading
    || teamsQuery.isLoading
    || usersQuery.isLoading
    || workspaceMembersQuery.isLoading;
  const isScheduleMemberMissing = scheduleForm.primaryUserIds.length === 0 && scheduleForm.secondaryUserIds.length === 0;
  const scheduleListError = schedulesQuery.error
    ?? servicesQuery.error
    ?? teamsQuery.error
    ?? usersQuery.error
    ?? workspaceMembersQuery.error;

  useEffect(() => {
    if (!overrideForm.userId || !overrideExcludedUserIds.has(overrideForm.userId)) {
      return;
    }

    setOverrideForm((current) => ({ ...current, userId: "" }));
  }, [overrideExcludedUserKey, overrideForm.userId, overrideExcludedUserIds]);

  useEffect(() => {
    if (!userOverrideForm.replacementUserId || userOverrideForm.replacementUserId !== userOverrideForm.unavailableUserId) {
      return;
    }

    setUserOverrideForm((current) => ({ ...current, replacementUserId: "" }));
  }, [userOverrideForm.replacementUserId, userOverrideForm.unavailableUserId]);

  function clearDetailOverrideSelection() {
    setDetailOverrideForm(null);
    setCalendarSelectionResetKey((current) => current + 1);
  }

  function handleSelectSchedule(scheduleId: string) {
    setSelectedScheduleId(scheduleId);
    clearDetailOverrideSelection();
  }

  function handlePreviewModeChange(mode: CalendarPreviewMode) {
    setPreviewMode(mode);
    clearDetailOverrideSelection();
  }

  function handleMovePreviewWindow(direction: -1 | 1) {
    setPreviewAnchorDate((current) => addCalendarPreviewStep(current, previewMode, direction));
    clearDetailOverrideSelection();
  }

  function handleResetPreviewWindow() {
    setPreviewAnchorDate(new Date());
    clearDetailOverrideSelection();
  }

  async function handleCreateSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!projectId) return;

    const schedule = await createScheduleMutation.mutateAsync({
      name: scheduleForm.name.trim(),
      workspace_id: projectId,
      timezone: scheduleForm.timezone,
      rotations: buildScheduleRotations(scheduleForm),
    });
    setSelectedScheduleId(schedule.id);
    setOverrideForm((current) => ({ ...current, scheduleId: schedule.id }));
    clearDetailOverrideSelection();
    setScheduleForm(createBlankScheduleForm());
    setActiveTab("schedules");
  }

  function addScheduleUser(layer: OnCallLayer, userId: string) {
    if (!userId) return;

    if (layer === "primary") {
      if (scheduleForm.primaryUserIds.includes(userId)) return;

      setScheduleForm((current) => ({
        ...current,
        primaryUserIds: [...current.primaryUserIds, userId],
      }));
      return;
    }

    if (scheduleForm.secondaryUserIds.includes(userId)) return;

    setScheduleForm((current) => ({
      ...current,
      secondaryUserIds: [...current.secondaryUserIds, userId],
    }));
  }

  function removeScheduleUser(layer: OnCallLayer, userId: string) {
    if (layer === "primary") {
      setScheduleForm((current) => ({
        ...current,
        primaryUserIds: current.primaryUserIds.filter((currentUserId) => currentUserId !== userId),
      }));
      return;
    }

    setScheduleForm((current) => ({
      ...current,
      secondaryUserIds: current.secondaryUserIds.filter((currentUserId) => currentUserId !== userId),
    }));
  }

  async function handleDeleteSchedule(schedule: OnCallSchedule) {
    await deleteScheduleMutation.mutateAsync(schedule.id);
    setIsDeleteScheduleDialogOpen(false);

    if (selectedScheduleId === schedule.id) {
      setSelectedScheduleId("");
      clearDetailOverrideSelection();
    }
  }

  function handleEditSchedule(schedule: OnCallSchedule) {
    setEditingScheduleId(schedule.id);
    setEditScheduleForm(createScheduleFormFromSchedule(schedule));
  }

  function handleCancelEditSchedule() {
    setEditingScheduleId("");
    setEditScheduleForm(null);
  }

  async function handleUpdateSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSchedule || !editScheduleForm) return;

    await updateScheduleMutation.mutateAsync({
      scheduleId: selectedSchedule.id,
      input: {
        name: editScheduleForm.name.trim(),
        timezone: editScheduleForm.timezone,
        rotations: buildScheduleRotations(editScheduleForm),
      },
    });
    setEditingScheduleId("");
    setEditScheduleForm(null);
  }

  function addEditScheduleUser(layer: OnCallLayer, userId: string) {
    if (!editScheduleForm) return;

    if (!userId) return;

    setEditScheduleForm((current) => {
      if (!current) return current;

      if (layer === "primary") {
        if (current.primaryUserIds.includes(userId)) return current;

        return {
          ...current,
          primaryUserIds: [...current.primaryUserIds, userId],
        };
      }

      if (current.secondaryUserIds.includes(userId)) return current;

      return {
        ...current,
        secondaryUserIds: [...current.secondaryUserIds, userId],
      };
    });
  }

  function removeEditScheduleUser(layer: OnCallLayer, userId: string) {
    setEditScheduleForm((current) => {
      if (!current) return current;

      if (layer === "primary") {
        return {
          ...current,
          primaryUserIds: current.primaryUserIds.filter((currentUserId) => currentUserId !== userId),
        };
      }

      return {
        ...current,
        secondaryUserIds: current.secondaryUserIds.filter((currentUserId) => currentUserId !== userId),
      };
    });
  }

  function handleStartOverrideFromCalendar({ endsAt, layer, startsAt }: CalendarOverrideRange) {
    if (!selectedSchedule) return;

    setDetailOverrideForm({
      endsAt: toLocalInputValue(new Date(endsAt)),
      layer,
      scheduleId: selectedSchedule.id,
      startsAt: toLocalInputValue(new Date(startsAt)),
      userId: "",
    });
  }

  async function handleCreateDetailOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detailOverrideForm) return;

    await createOverrideMutation.mutateAsync({
      ends_at: new Date(detailOverrideForm.endsAt).toISOString(),
      layer: detailOverrideForm.layer,
      schedule_id: detailOverrideForm.scheduleId,
      starts_at: new Date(detailOverrideForm.startsAt).toISOString(),
      user_id: detailOverrideForm.userId,
    });
    clearDetailOverrideSelection();
  }

  async function handleCreateOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await createOverrideMutation.mutateAsync({
      ends_at: new Date(overrideForm.endsAt).toISOString(),
      layer: overrideForm.layer,
      schedule_id: overrideForm.scheduleId || selectedSchedule?.id || "",
      starts_at: new Date(overrideForm.startsAt).toISOString(),
      user_id: overrideForm.userId,
    });
  }

  async function handleCreateUserOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userOverrideForm.replacementUserId || userOverridePlans.length === 0) {
      return;
    }

    for (const plan of userOverridePlans) {
      await createUserOverrideMutation.mutateAsync({
        ends_at: plan.endsAt,
        layer: plan.layer,
        schedule_id: plan.scheduleId,
        starts_at: plan.startsAt,
        user_id: userOverrideForm.replacementUserId,
      });
    }

    setUserOverrideForm((current) => ({
      ...current,
      replacementUserId: "",
      unavailableUserId: "",
    }));
  }

  return (
    <LocalizedText>
      <section className="grid gap-5">
      <PageHeader
        description="Manage responder rotations, schedule previews, and temporary coverage overrides."
        help="On-call schedules decide who receives responsibility for incidents. Use Schedules for recurring coverage and Overrides for temporary changes such as holidays or substitutions."
        title="On-call"
      />

      <Panel className="rounded-[20px] sm:p-5 grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft pb-2.5">
          <div aria-label="On-call sections" className="flex items-center gap-1 overflow-x-auto" role="tablist">
            <TabButton active={activeTab === "schedules"} count={summary.scheduleCount} label="Schedules" onClick={() => setActiveTab("schedules")} />
            <TabButton active={activeTab === "overrides"} count={summary.overrideCount} label="Overrides" onClick={() => setActiveTab("overrides")} />
          </div>
          {activeTab === "schedules" ? (
            <Button onClick={() => setActiveTab("new-schedule")} size="sm" variant="secondary">
              Create schedule
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border border-hairline-soft bg-surface-2/45 px-3.5 py-3 text-ink-muted text-xs leading-[1.45]">
          {activeTab === "schedules"
            ? "Schedules define the recurring rotation for each layer. Select one to preview who is on call now and in the future."
            : activeTab === "overrides"
              ? "Overrides temporarily replace a scheduled responder without changing the recurring rotation."
              : "Create a schedule by choosing a timezone, rotation cadence, and at least one responder."}
        </div>

        {activeTab === "schedules" ? (
          <div className="grid gap-4 min-w-0" role="tabpanel">
            {isLoading ? <TablePageSkeleton label="Loading schedules" /> : null}
            {scheduleListError ? <ErrorState error={scheduleListError} onRetry={() => Promise.all([schedulesQuery.refetch(), servicesQuery.refetch(), teamsQuery.refetch(), usersQuery.refetch(), workspaceMembersQuery.refetch()])} title="Could not load schedules" /> : null}
            {!isLoading && !scheduleListError && schedules.length === 0 ? (
              <EmptyState message="No on-call schedules have been configured." title="No schedules" />
            ) : null}
            {!isLoading && !scheduleListError && schedules.length > 0 ? (
              <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] min-w-0">
                <aside className="grid gap-3 min-w-0 xl:sticky xl:top-[92px]">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Schedule list</span>
                    <span className="text-ink-muted text-xs leading-none">{schedules.length}</span>
                  </div>
                  <div className="grid gap-2.5 min-w-0 xl:max-h-[calc(100vh-230px)] xl:overflow-y-auto xl:pr-1">
                    {schedules.map((schedule) => (
                      <ScheduleCard
                        isSelected={selectedSchedule?.id === schedule.id}
                        key={schedule.id}
                        onSelect={() => handleSelectSchedule(schedule.id)}
                        schedule={schedule}
                        serviceNameById={serviceNameById}
                        teamNameById={teamNameById}
                        userNameById={userNameById}
                      />
                    ))}
                  </div>
                </aside>
                {selectedSchedule ? (
                  <ScheduleDetail
                    createOverrideError={detailOverrideForm ? createOverrideMutation.error : null}
                    deleteOverrideError={deleteOverrideMutation.error}
                    deleteError={deleteScheduleMutation.error}
                    deletingOverrideId={deleteOverrideMutation.variables}
                    editForm={editingScheduleId === selectedSchedule.id ? editScheduleForm : null}
                    isCreatingOverride={createOverrideMutation.isPending}
                    isDeleting={deleteScheduleMutation.isPending && deleteScheduleMutation.variables === selectedSchedule.id}
                    isDeletingOverride={deleteOverrideMutation.isPending}
                    isPreviewLoading={previewQuery.isLoading}
                    isUpdating={updateScheduleMutation.isPending && updateScheduleMutation.variables?.scheduleId === selectedSchedule.id}
                    onAddEditUser={addEditScheduleUser}
                    onCancelEdit={handleCancelEditSchedule}
                    onCancelOverride={clearDetailOverrideSelection}
                    onCreateOverride={handleCreateDetailOverride}
                    onDelete={() => setIsDeleteScheduleDialogOpen(true)}
                    onDeleteOverride={(overrideId) => deleteOverrideMutation.mutate(overrideId)}
                    onEdit={() => handleEditSchedule(selectedSchedule)}
                    onEditFormChange={setEditScheduleForm}
                    onMovePreviewWindow={handleMovePreviewWindow}
                    onRemoveEditUser={removeEditScheduleUser}
                    onOverrideFormChange={setDetailOverrideForm}
                    onSelectOverrideRange={handleStartOverrideFromCalendar}
                    onUpdate={handleUpdateSchedule}
                    overrideForm={detailOverrideForm}
                    previewMode={previewMode}
                    onPreviewModeChange={handlePreviewModeChange}
                    onResetPreviewWindow={handleResetPreviewWindow}
                    preview={previewQuery.data}
                    previewRangeLabel={formatCalendarPreviewRange(previewWindow, locale)}
                    schedule={selectedSchedule}
                    selectionResetKey={calendarSelectionResetKey}
                    updateError={updateScheduleMutation.error}
                    userNameById={userNameById}
                    users={users}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "overrides" ? (
          <div className="grid gap-4 min-w-0" role="tabpanel">
            <div className="grid items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.52fr)] min-w-0">
              <section className="grid gap-4 min-w-0">
                <SectionHeader
                  description="Review active and upcoming temporary coverage changes."
                  title="Scheduled overrides"
                />
                <DataTable
                  columns={overrideColumns}
                  emptyState={<EmptyState message="No overrides have been scheduled." title="No overrides" />}
                  getRowKey={(override) => override.id}
                  rows={overrides}
                />
              </section>
              <section className="grid gap-4 min-w-0">
                <SectionHeader
                  description="Choose whether to replace a schedule window or substitute one user everywhere they are assigned."
                  title="Create an override"
                />
                <div aria-label="Override type" className="flex items-center gap-1 border border-hairline-soft rounded-lg p-1" role="tablist">
                  <TabButton active={overrideCreationMode === "schedule"} label="Schedule override" onClick={() => setOverrideCreationMode("schedule")} />
                  <TabButton active={overrideCreationMode === "user"} label="User override" onClick={() => setOverrideCreationMode("user")} />
                </div>
                {overrideCreationMode === "schedule" ? (
                  <form className="grid gap-4 min-w-0" onSubmit={handleCreateOverride}>
                    <div className="bg-surface-2 border border-hairline rounded-md grid gap-2 p-3">
                      <strong className="text-ink text-sm font-[650] leading-tight">Temporary coverage change</strong>
                      <p className="text-ink-muted text-[13px] leading-[1.45] m-0">Overrides replace the selected layer only during the window, then the schedule rotation resumes automatically.</p>
                    </div>
                    <div className="grid gap-3.5">
                      <Field label="Schedule" required>
                        <Select
                          disabled={createOverrideMutation.isPending}
                          onChange={(event) => setOverrideForm((current) => ({ ...current, scheduleId: event.target.value }))}
                          required
                          value={overrideForm.scheduleId || selectedSchedule?.id || ""}
                        >
                          <option value="">Select schedule</option>
                          {schedules.map((schedule) => (
                            <option key={schedule.id} value={schedule.id}>{schedule.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Layer">
                        <Select
                          disabled={createOverrideMutation.isPending}
                          onChange={(event) => setOverrideForm((current) => ({ ...current, layer: event.target.value as OnCallLayer }))}
                          value={overrideForm.layer}
                        >
                          <option value="primary">primary</option>
                          <option value="secondary">secondary</option>
                        </Select>
                      </Field>
                      <Field label="User" required>
                        <Select
                          disabled={createOverrideMutation.isPending || overrideSelectableUsers.length === 0}
                          onChange={(event) => setOverrideForm((current) => ({ ...current, userId: event.target.value }))}
                          required
                          value={overrideForm.userId}
                        >
                          <option value="">{overrideSelectableUsers.length === 0 ? "No replacement users available" : "Select user"}</option>
                          {overrideSelectableUsers.map((user) => (
                            <option key={user.id} value={user.id}>{user.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Starts at">
                        <TextInput
                          disabled={createOverrideMutation.isPending}
                          onChange={(event) => setOverrideForm((current) => ({ ...current, startsAt: event.target.value }))}
                          type="datetime-local"
                          value={overrideForm.startsAt}
                        />
                      </Field>
                      <Field label="Ends at">
                        <TextInput
                          disabled={createOverrideMutation.isPending}
                          onChange={(event) => setOverrideForm((current) => ({ ...current, endsAt: event.target.value }))}
                          type="datetime-local"
                          value={overrideForm.endsAt}
                        />
                      </Field>
                    </div>
                    {createOverrideMutation.error ? (
                      <ErrorState error={createOverrideMutation.error} title="Could not create override" />
                    ) : null}
                    <div className="flex flex-wrap gap-2.5 justify-end">
                      <Button
                        disabled={!(overrideForm.scheduleId || selectedSchedule?.id) || !overrideForm.userId || overrideExcludedUserIds.has(overrideForm.userId)}
                        isLoading={createOverrideMutation.isPending}
                        type="submit"
                        variant="primary"
                      >
                        Create override
                      </Button>
                    </div>
                  </form>
                ) : null}
                {overrideCreationMode === "user" ? (
                  <form className="grid gap-4 min-w-0" onSubmit={handleCreateUserOverride}>
                    <div className="bg-surface-2 border border-hairline rounded-md grid gap-2 p-3">
                      <strong className="text-ink text-sm font-[650] leading-tight">User substitution</strong>
                      <p className="text-ink-muted text-[13px] leading-[1.45] m-0">Replaces only the windows where the unavailable user is actually assigned across schedules.</p>
                    </div>
                    <div className="grid gap-3.5">
                      <Field label="Unavailable user" required>
                        <Select
                          disabled={createUserOverrideMutation.isPending}
                          onChange={(event) => setUserOverrideForm((current) => ({ ...current, unavailableUserId: event.target.value }))}
                          required
                          value={userOverrideForm.unavailableUserId}
                        >
                          <option value="">Select user</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>{formatUserOption(user)}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Replacement user" required>
                        <Select
                          disabled={createUserOverrideMutation.isPending || !userOverrideForm.unavailableUserId || userOverrideReplacementUsers.length === 0}
                          onChange={(event) => setUserOverrideForm((current) => ({ ...current, replacementUserId: event.target.value }))}
                          required
                          value={userOverrideForm.replacementUserId}
                        >
                          <option value="">{userOverrideReplacementUsers.length === 0 ? "No replacement users available" : "Select user"}</option>
                          {userOverrideReplacementUsers.map((user) => (
                            <option key={user.id} value={user.id}>{formatUserOption(user)}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Layer">
                        <Select
                          disabled={createUserOverrideMutation.isPending}
                          onChange={(event) => setUserOverrideForm((current) => ({ ...current, layer: event.target.value as UserOverrideLayer }))}
                          value={userOverrideForm.layer}
                        >
                          <option value="both">primary and secondary</option>
                          <option value="primary">primary</option>
                          <option value="secondary">secondary</option>
                        </Select>
                      </Field>
                      <Field label="Starts at">
                        <TextInput
                          disabled={createUserOverrideMutation.isPending}
                          onChange={(event) => setUserOverrideForm((current) => ({ ...current, startsAt: event.target.value }))}
                          type="datetime-local"
                          value={userOverrideForm.startsAt}
                        />
                      </Field>
                      <Field label="Ends at">
                        <TextInput
                          disabled={createUserOverrideMutation.isPending}
                          onChange={(event) => setUserOverrideForm((current) => ({ ...current, endsAt: event.target.value }))}
                          type="datetime-local"
                          value={userOverrideForm.endsAt}
                        />
                      </Field>
                    </div>
                    <UserOverrideImpactPreview plans={userOverridePlans} schedules={schedules} />
                    {createUserOverrideMutation.error ? (
                      <ErrorState error={createUserOverrideMutation.error} title="Could not create user override" />
                    ) : null}
                    <div className="flex flex-wrap gap-2.5 justify-end">
                      <Button
                        disabled={!userOverrideForm.unavailableUserId
                          || !userOverrideForm.replacementUserId
                          || userOverrideForm.unavailableUserId === userOverrideForm.replacementUserId
                          || userOverridePlans.length === 0}
                        isLoading={createUserOverrideMutation.isPending}
                        type="submit"
                        variant="primary"
                      >
                        Create user override
                      </Button>
                    </div>
                  </form>
                ) : null}
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "new-schedule" ? (
          <div className="grid gap-4 min-w-0" role="tabpanel">
            <form className="grid gap-4" onSubmit={handleCreateSchedule}>
              <SectionHeader
                description="A schedule repeats a responder rotation and gives the escalation system a reliable person to page."
                title="Create a schedule"
              />
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field label="Name" required>
                  <TextInput
                    disabled={createScheduleMutation.isPending}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={scheduleForm.name}
                  />
                </Field>
                <Field hint="Used to calculate rotation windows and display the calendar." label="Timezone" required>
                  <TextInput
                    disabled={createScheduleMutation.isPending}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, timezone: event.target.value }))}
                    required
                    value={scheduleForm.timezone}
                  />
                </Field>
                <Field hint="How often the active responder changes." label="Rotation type">
                  <Select
                    disabled={createScheduleMutation.isPending}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, rotationType: event.target.value as OnCallRotation["rotation_type"] }))}
                    value={scheduleForm.rotationType}
                  >
                    <option value="daily">daily</option>
                    <option value="weekly">weekly</option>
                    <option value="custom">custom hours</option>
                  </Select>
                </Field>
                <Field hint="The number of days, weeks, or custom hours between handoffs." label="Rotation interval">
                  <NumberInput
                    disabled={createScheduleMutation.isPending}
                    min={1}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, rotationInterval: Number(event.target.value) }))}
                    value={scheduleForm.rotationInterval}
                  />
                </Field>
                <Field label="Starts at">
                  <TextInput
                    disabled={createScheduleMutation.isPending}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, startsAt: event.target.value }))}
                    type="datetime-local"
                    value={scheduleForm.startsAt}
                  />
                </Field>
              </div>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <RotationMemberPicker
                  disabled={createScheduleMutation.isPending}
                  label="Primary rotation"
                  onAdd={(userId) => addScheduleUser("primary", userId)}
                  onRemove={(userId) => removeScheduleUser("primary", userId)}
                  onReorder={(userIds) => setScheduleForm((current) => ({ ...current, primaryUserIds: userIds }))}
                  userIds={scheduleForm.primaryUserIds}
                  userNameById={userNameById}
                  users={users}
                />
                <RotationMemberPicker
                  disabled={createScheduleMutation.isPending}
                  label="Secondary rotation"
                  onAdd={(userId) => addScheduleUser("secondary", userId)}
                  onRemove={(userId) => removeScheduleUser("secondary", userId)}
                  onReorder={(userIds) => setScheduleForm((current) => ({ ...current, secondaryUserIds: userIds }))}
                  userIds={scheduleForm.secondaryUserIds}
                  userNameById={userNameById}
                  users={users}
                />
              </div>
              {createScheduleMutation.error ? (
                <ErrorState error={createScheduleMutation.error} title="Could not create schedule" />
              ) : null}
              <div className="flex flex-wrap gap-2.5 justify-end">
                <Button
                  disabled={!projectId
                    || !scheduleForm.name.trim()
                    || isScheduleMemberMissing}
                  isLoading={createScheduleMutation.isPending}
                  type="submit"
                  variant="primary"
                >
                  Create schedule
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </Panel>
      <Dialog
        confirmLabel="Delete schedule"
        description={selectedSchedule ? `Delete "${selectedSchedule.name}"? This also removes its rotations and overrides.` : undefined}
        isConfirming={deleteScheduleMutation.isPending}
        onClose={() => setIsDeleteScheduleDialogOpen(false)}
        onConfirm={() => {
          if (selectedSchedule) void handleDeleteSchedule(selectedSchedule);
        }}
        open={isDeleteScheduleDialogOpen}
        title="Delete schedule?"
        tone="danger"
      />
      </section>
    </LocalizedText>
  );
}

function ScheduleCard({
  isSelected,
  onSelect,
  schedule,
  serviceNameById,
  teamNameById,
  userNameById,
}: {
  isSelected: boolean;
  onSelect: () => void;
  schedule: OnCallSchedule;
  serviceNameById: Map<string, string>;
  teamNameById: Map<string, string>;
  userNameById: Map<string, string>;
}) {
  const primaryRotation = schedule.rotations.find((rotation) => rotation.layer === "primary");
  const secondaryRotation = schedule.rotations.find((rotation) => rotation.layer === "secondary");
  const overrides = collectOverrides([schedule]);
  const cadence = formatScheduleCadence(schedule);

  return (
    <button
      className={`border rounded-xl grid gap-3 min-w-0 p-3.5 text-left transition-[background-color,border-color,box-shadow] ${isSelected ? "bg-surface-2 border-accent-blue/70 shadow-[0_0_0_1px_rgba(0,153,255,0.16)]" : "bg-surface-2/45 border-hairline hover:bg-surface-2 hover:border-accent-blue/45"}`}
      onClick={onSelect}
      type="button"
    >
      <header className="flex items-start gap-3.5 justify-between">
        <div>
          <h3 className="text-ink text-[17px] leading-[1.2] m-0 mb-1.5">{schedule.name}</h3>
          <p className="text-ink-muted text-xs leading-[1.35] m-0">{formatScheduleScope(schedule, serviceNameById, teamNameById)}</p>
          <p className="text-ink-subtle text-xs leading-[1.35] m-0 mt-1">Cadence: {cadence}</p>
        </div>
        <span className="bg-surface-2 border border-hairline-soft rounded-full flex-none px-2.5 py-1.75 text-ink-muted text-xs leading-[1.35]">
          {schedule.timezone}
        </span>
      </header>
      <div className="grid gap-2">
        <ScheduleLayerSummary label="Primary" rotation={primaryRotation} userNameById={userNameById} />
        <ScheduleLayerSummary label="Secondary" rotation={secondaryRotation} userNameById={userNameById} />
      </div>
      <footer className="flex items-center border-t border-hairline-soft gap-3 justify-between pt-2.75 text-ink-muted text-xs leading-[1.35]">
        <span>{overrides.length} overrides</span>
        <time className="text-ink-subtle" dateTime={schedule.updated_at}>{formatRelativeTime(schedule.updated_at)}</time>
      </footer>
    </button>
  );
}

function ScheduleLayerSummary({
  label,
  rotation,
  userNameById,
}: {
  label: string;
  rotation: OnCallRotation | undefined;
  userNameById: Map<string, string>;
}) {
  const participants = rotation
    ? [...rotation.participants]
      .sort((a, b) => a.position - b.position)
      .map((participant) => formatUser(participant.user_id, userNameById))
    : [];

  return (
    <div className="grid gap-1 min-w-0">
      <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">{label}</span>
      <strong className="text-ink text-[13px] leading-[1.35] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {participants.length > 0 ? participants.join(", ") : "Unassigned"}
      </strong>
    </div>
  );
}

function ScheduleDetail({
  createOverrideError,
  deleteOverrideError,
  deleteError,
  deletingOverrideId,
  editForm,
  isCreatingOverride,
  isDeleting,
  isDeletingOverride,
  isPreviewLoading,
  isUpdating,
  onAddEditUser,
  onCancelEdit,
  onCancelOverride,
  onCreateOverride,
  onDelete,
  onDeleteOverride,
  onEdit,
  onEditFormChange,
  onMovePreviewWindow,
  onOverrideFormChange,
  onPreviewModeChange,
  onRemoveEditUser,
  onResetPreviewWindow,
  onSelectOverrideRange,
  onUpdate,
  overrideForm,
  previewMode,
  preview,
  previewRangeLabel,
  schedule,
  selectionResetKey,
  updateError,
  userNameById,
  users,
}: {
  createOverrideError: Error | null;
  deleteOverrideError: Error | null;
  deleteError: Error | null;
  deletingOverrideId: string | undefined;
  editForm: ScheduleFormState | null;
  isCreatingOverride: boolean;
  isDeleting: boolean;
  isDeletingOverride: boolean;
  isPreviewLoading: boolean;
  isUpdating: boolean;
  onAddEditUser: (layer: OnCallLayer, userId: string) => void;
  onCancelEdit: () => void;
  onCancelOverride: () => void;
  onCreateOverride: (event: React.FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onDeleteOverride: (overrideId: string) => void;
  onEdit: () => void;
  onEditFormChange: React.Dispatch<React.SetStateAction<ScheduleFormState | null>>;
  onMovePreviewWindow: (direction: -1 | 1) => void;
  onOverrideFormChange: React.Dispatch<React.SetStateAction<OverrideFormState | null>>;
  onPreviewModeChange: (mode: CalendarPreviewMode) => void;
  onRemoveEditUser: (layer: OnCallLayer, userId: string) => void;
  onResetPreviewWindow: () => void;
  onSelectOverrideRange: (range: CalendarOverrideRange) => void;
  onUpdate: (event: React.FormEvent<HTMLFormElement>) => void;
  overrideForm: OverrideFormState | null;
  previewMode: CalendarPreviewMode;
  preview: OnCallSchedulePreview | undefined;
  previewRangeLabel: string;
  schedule: OnCallSchedule;
  selectionResetKey: number;
  updateError: Error | null;
  userNameById: Map<string, string>;
  users: User[];
}) {
  const [previewLayer, setPreviewLayer] = useState<OnCallLayer>("primary");
  const sortedRotations = [...schedule.rotations].sort((a, b) => a.layer.localeCompare(b.layer));
  const overrides = collectOverrides([schedule]);
  const overrideExcludedUserIds = useMemo(
    () => overrideForm ? collectAssignedUserIdsForOverride(schedule, overrideForm) : new Set<string>(),
    [overrideForm, schedule],
  );
  const cadence = formatScheduleCadence(schedule);

  return (
    <section className="bg-canvas/30 border border-hairline rounded-[20px] grid gap-5 min-w-0 p-4 sm:p-5 xl:min-h-[calc(100vh-190px)]">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Schedule detail</span>
            <h3 className="text-ink text-xl leading-[1.2] m-0 mt-1.5">{schedule.name}</h3>
            <p className="text-ink-muted text-xs leading-[1.35] m-0 mt-1">{schedule.timezone} · {cadence}</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
            {editForm ? (
              <Button disabled={isUpdating} onClick={onCancelEdit} size="sm" variant="ghost">
                Cancel
              </Button>
            ) : (
              <Button disabled={isDeleting} onClick={onEdit} size="sm" variant="secondary">
                Edit
              </Button>
            )}
            <Button disabled={isDeleting || isUpdating} isLoading={isDeleting} onClick={onDelete} size="sm" variant="danger">
              Delete
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong className="text-ink text-base leading-[1.2]">{previewRangeLabel}</strong>
          <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">
            <div aria-label="Preview layer" className="flex items-center gap-1 border border-hairline-soft rounded-lg p-1" role="tablist">
              <TabButton active={previewLayer === "primary"} label="Primary" onClick={() => setPreviewLayer("primary")} />
              <TabButton active={previewLayer === "secondary"} label="Secondary" onClick={() => setPreviewLayer("secondary")} />
            </div>
            <div aria-label="Preview range" className="flex items-center gap-1 border border-hairline-soft rounded-lg p-1" role="tablist">
              <TabButton active={previewMode === "week"} label="Week" onClick={() => onPreviewModeChange("week")} />
              <TabButton active={previewMode === "month"} label="Month" onClick={() => onPreviewModeChange("month")} />
            </div>
            <div aria-label="Preview navigation" className="flex items-center gap-1">
              <Button aria-label="Previous period" className="w-8.5 px-0" onClick={() => onMovePreviewWindow(-1)} size="sm" title="Previous period" variant="ghost">
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.25} />
              </Button>
              <Button onClick={onResetPreviewWindow} size="sm" variant="ghost">
                Today
              </Button>
              <Button aria-label="Next period" className="w-8.5 px-0" onClick={() => onMovePreviewWindow(1)} size="sm" title="Next period" variant="ghost">
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2.25} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {deleteError ? <ErrorState error={deleteError} title="Could not delete schedule" /> : null}
      {deleteOverrideError ? <ErrorState error={deleteOverrideError} title="Could not delete override" /> : null}
      {updateError ? <ErrorState error={updateError} title="Could not update schedule" /> : null}

      {editForm ? (
        <ScheduleEditForm
          disabled={isUpdating}
          form={editForm}
          onAddUser={onAddEditUser}
          onCancel={onCancelEdit}
          onChange={onEditFormChange}
          onRemoveUser={onRemoveEditUser}
          onSubmit={onUpdate}
          userNameById={userNameById}
          users={users}
        />
      ) : null}

      <section className="relative grid gap-3">
        {overrideForm ? (
          <div className="lg:absolute lg:right-3 lg:top-3 lg:z-10 lg:w-[360px]">
            <ScheduleDetailOverrideForm
              disabled={isCreatingOverride}
              error={createOverrideError}
              excludedUserIds={overrideExcludedUserIds}
              form={overrideForm}
              onCancel={onCancelOverride}
              onChange={onOverrideFormChange}
              onSubmit={onCreateOverride}
              users={users}
            />
          </div>
        ) : null}
        {isPreviewLoading ? <LoadingState message="Loading preview..." /> : (
          <ScheduleCalendarPreview
            mode={previewMode}
            layer={previewLayer}
            onSelectOverrideRange={onSelectOverrideRange}
            preview={preview}
            schedule={schedule}
            selectionResetKey={selectionResetKey}
            userNameById={userNameById}
          />
        )}
      </section>

      {!editForm ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
          <section className="grid gap-2 content-start">
            <SectionHeader
              description="The recurring people assigned to each response layer."
              title="Rotations"
            />
            {sortedRotations.map((rotation) => (
              <RotationRow key={rotation.id} rotation={rotation} userNameById={userNameById} />
            ))}
          </section>

          <section className="grid gap-2 content-start min-w-0">
            <SectionHeader
              description="Temporary changes applied to this schedule."
              title="Overrides"
            />
            {overrides.length === 0 ? (
              <EmptyState message="No overrides have been scheduled for this schedule." title="No overrides" />
            ) : (
              <div className="grid gap-2">
                {overrides.map((override) => (
                  <div
                    className="bg-surface-2/55 border border-hairline-soft rounded-md items-center grid gap-3 grid-cols-[minmax(0,1fr)_auto] px-3 py-2.5"
                    key={override.id}
                  >
                    <div className="grid gap-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-accent-blue text-xs font-bold uppercase">{override.layer}</span>
                        <span className="text-ink-subtle text-[11px] font-bold leading-none uppercase">{formatOverrideStatus(override)}</span>
                      </div>
                      <strong className="text-ink text-[13px] leading-[1.35] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{formatUser(override.user_id, userNameById)}</strong>
                      <time className="text-ink-muted text-xs leading-[1.35]" dateTime={override.starts_at}>
                        {formatDateTime(override.starts_at)} - {formatDateTime(override.ends_at)}
                      </time>
                    </div>
                    <Button
                      disabled={isDeletingOverride && deletingOverrideId === override.id}
                      isLoading={isDeletingOverride && deletingOverrideId === override.id}
                      onClick={() => onDeleteOverride(override.id)}
                      size="sm"
                      variant="danger"
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function UserOverrideImpactPreview({
  plans,
  schedules,
}: {
  plans: UserOverridePlan[];
  schedules: OnCallSchedule[];
}) {
  const scheduleNameById = new Map(schedules.map((schedule) => [schedule.id, schedule.name]));
  const visiblePlans = plans.slice(0, 5);
  const hiddenPlanCount = Math.max(plans.length - visiblePlans.length, 0);
  const affectedScheduleCount = new Set(plans.map((plan) => plan.scheduleId)).size;

  if (plans.length === 0) {
    return (
      <div className="bg-surface-2/55 border border-hairline-soft rounded-md px-3 py-2.5 text-ink-muted text-[13px] leading-[1.45]">
        No matching on-call windows found for this user in the selected range.
      </div>
    );
  }

  return (
    <div className="bg-surface-2/55 border border-hairline-soft rounded-md grid gap-2.5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-ink text-sm leading-[1.3]">Impact</strong>
        <span className="text-ink-muted text-xs leading-[1.35]">
          {plans.length} override windows across {affectedScheduleCount} schedules
        </span>
      </div>
      <div className="grid gap-1.5">
        {visiblePlans.map((plan) => (
          <div className="grid gap-1 min-w-0" key={`${plan.scheduleId}:${plan.layer}:${plan.startsAt}:${plan.endsAt}`}>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-accent-blue text-[11px] font-bold uppercase">{plan.layer}</span>
              <strong className="text-ink text-xs leading-[1.35] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {scheduleNameById.get(plan.scheduleId) ?? shortId(plan.scheduleId)}
              </strong>
            </div>
            <time className="text-ink-muted text-xs leading-[1.35]" dateTime={plan.startsAt}>
              {formatDateTime(plan.startsAt)} - {formatDateTime(plan.endsAt)}
            </time>
          </div>
        ))}
      </div>
      {hiddenPlanCount > 0 ? (
        <span className="text-ink-subtle text-xs leading-[1.35]">+ {hiddenPlanCount} more windows</span>
      ) : null}
    </div>
  );
}

function ScheduleEditForm({
  disabled,
  form,
  onAddUser,
  onCancel,
  onChange,
  onRemoveUser,
  onSubmit,
  userNameById,
  users,
}: {
  disabled: boolean;
  form: ScheduleFormState;
  onAddUser: (layer: OnCallLayer, userId: string) => void;
  onCancel: () => void;
  onChange: React.Dispatch<React.SetStateAction<ScheduleFormState | null>>;
  onRemoveUser: (layer: OnCallLayer, userId: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  userNameById: Map<string, string>;
  users: User[];
}) {
  const isMemberMissing = form.primaryUserIds.length === 0 && form.secondaryUserIds.length === 0;
  const workspaceUserIds = new Set(users.map((user) => user.id));
  const nonWorkspaceUserIds = [...form.primaryUserIds, ...form.secondaryUserIds]
    .filter((userId, index, userIds) => userIds.indexOf(userId) === index)
    .filter((userId) => !workspaceUserIds.has(userId));

  return (
    <form className="border border-hairline-soft rounded-xl grid gap-4 min-w-0 p-3" onSubmit={onSubmit}>
      <SectionHeader title="Edit schedule" />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Name" required>
          <TextInput
            disabled={disabled}
            onChange={(event) => onChange((current) => current ? { ...current, name: event.target.value } : current)}
            required
            value={form.name}
          />
        </Field>
        <Field label="Timezone" required>
          <TextInput
            disabled={disabled}
            onChange={(event) => onChange((current) => current ? { ...current, timezone: event.target.value } : current)}
            required
            value={form.timezone}
          />
        </Field>
        <Field label="Rotation type">
          <Select
            disabled={disabled}
            onChange={(event) => onChange((current) => current ? { ...current, rotationType: event.target.value as OnCallRotation["rotation_type"] } : current)}
            value={form.rotationType}
          >
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="custom">custom hours</option>
          </Select>
        </Field>
        <Field label="Rotation interval">
          <NumberInput
            disabled={disabled}
            min={1}
            onChange={(event) => onChange((current) => current ? { ...current, rotationInterval: Number(event.target.value) } : current)}
            value={form.rotationInterval}
          />
        </Field>
        <Field label="Starts at">
          <TextInput
            disabled={disabled}
            onChange={(event) => onChange((current) => current ? { ...current, startsAt: event.target.value } : current)}
            type="datetime-local"
            value={form.startsAt}
          />
        </Field>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <RotationMemberPicker
          disabled={disabled}
          label="Primary rotation"
          onAdd={(userId) => onAddUser("primary", userId)}
          onRemove={(userId) => onRemoveUser("primary", userId)}
          onReorder={(userIds) => onChange((current) => current ? { ...current, primaryUserIds: userIds } : current)}
          userIds={form.primaryUserIds}
          userNameById={userNameById}
          users={users}
        />
        <RotationMemberPicker
          disabled={disabled}
          label="Secondary rotation"
          onAdd={(userId) => onAddUser("secondary", userId)}
          onRemove={(userId) => onRemoveUser("secondary", userId)}
          onReorder={(userIds) => onChange((current) => current ? { ...current, secondaryUserIds: userIds } : current)}
          userIds={form.secondaryUserIds}
          userNameById={userNameById}
          users={users}
        />
      </div>
      {nonWorkspaceUserIds.length > 0 ? (
        <div className="bg-[rgba(255,196,87,0.1)] border border-[rgba(255,196,87,0.24)] rounded-md px-3 py-2 text-[13px] leading-[1.45] text-ink-muted">
          Remove users outside this workspace before saving: {nonWorkspaceUserIds.map((userId) => formatUser(userId, userNameById)).join(", ")}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2.5 justify-end">
        <Button disabled={disabled} onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button disabled={!form.name.trim() || isMemberMissing || nonWorkspaceUserIds.length > 0} isLoading={disabled} type="submit" variant="primary">
          Save changes
        </Button>
      </div>
    </form>
  );
}

function ScheduleCalendarPreview({
  mode,
  layer,
  onSelectOverrideRange,
  preview,
  schedule,
  selectionResetKey,
  userNameById,
}: {
  mode: CalendarPreviewMode;
  layer: OnCallLayer;
  onSelectOverrideRange: (range: CalendarOverrideRange) => void;
  preview: OnCallSchedulePreview | undefined;
  schedule: OnCallSchedule;
  selectionResetKey: number;
  userNameById: Map<string, string>;
}) {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const calendarRef = useRef<FullCalendar | null>(null);
  const calendarLocale = locale === "ko"
    ? koLocale
    : locale === "zh-CN"
      ? zhCnLocale
      : "en";
  const events = useMemo(
    () => createCalendarEvents(preview, schedule, layer, mode, userNameById),
    [layer, mode, preview, schedule, userNameById],
  );

  useEffect(() => {
    calendarRef.current?.getApi().unselect();
  }, [selectionResetKey]);

  if (!preview || preview.entries.length === 0) {
    return <EmptyState message="No preview entries available." title="No preview" />;
  }

  return (
    <div className={`on-call-calendar ${mode === "month" ? "is-month" : "is-week"} border border-hairline-soft rounded-xl overflow-hidden`}>
      <FullCalendar
        ref={calendarRef}
        allDaySlot={mode === "month"}
        dayHeaderContent={(content) => renderCalendarDayHeaderContent(content.date, mode, locale)}
        editable={false}
        eventContent={renderCalendarEventContent}
        eventDisplay="block"
        events={events}
        eventTimeFormat={{ hour: "2-digit", hour12: false, minute: "2-digit" }}
        dateClick={(click: DateClickArg) => {
          const range = createOverrideRangeFromDateClick(click, layer, mode);
          const calendarApi = calendarRef.current?.getApi();

          calendarApi?.unselect();
          calendarApi?.select({
            allDay: mode === "month" || click.allDay,
            end: range.endsAt,
            start: range.startsAt,
          });
          onSelectOverrideRange(range);
        }}
        firstDay={1}
        headerToolbar={false}
        height="auto"
        key={`${mode}:${layer}:${preview.starts_at}:${locale}`}
        initialDate={preview.starts_at}
        initialView={mode === "month" ? "dayGridMonth" : "timeGridWeek"}
        locale={calendarLocale}
        nowIndicator={mode === "week"}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        select={(selection: DateSelectArg) => {
          onSelectOverrideRange(createOverrideRangeFromSelection(selection, layer, mode));
        }}
        selectable
        selectMirror
        selectMinDistance={5}
        selectOverlap
        slotDuration="01:00:00"
        slotLabelFormat={{ hour: "2-digit", hour12: false, minute: "2-digit" }}
        snapDuration="01:00:00"
        timeZone="local"
        unselectAuto={false}
        visibleRange={{
          end: preview.ends_at,
          start: preview.starts_at,
        }}
      />
    </div>
  );
}

function ScheduleDetailOverrideForm({
  disabled,
  error,
  excludedUserIds,
  form,
  onCancel,
  onChange,
  onSubmit,
  users,
}: {
  disabled: boolean;
  error: Error | null;
  excludedUserIds: Set<string>;
  form: OverrideFormState;
  onCancel: () => void;
  onChange: React.Dispatch<React.SetStateAction<OverrideFormState | null>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  users: User[];
}) {
  const excludedUserKey = createUserIdSetKey(excludedUserIds);
  const selectableUsers = useMemo(
    () => users.filter((user) => !excludedUserIds.has(user.id)),
    [excludedUserKey, users],
  );

  useEffect(() => {
    if (!form.userId || !excludedUserIds.has(form.userId)) {
      return;
    }

    onChange((current) => current ? { ...current, userId: "" } : current);
  }, [excludedUserKey, excludedUserIds, form.userId, onChange]);

  return (
    <form className="bg-surface-2/95 border border-accent-blue/30 rounded-xl grid gap-3 p-3.5 shadow-[0_18px_48px_rgba(0,0,0,0.34),0_0_0_1px_rgba(0,153,255,0.08)] backdrop-blur" onSubmit={onSubmit}>
      <div className="grid items-start gap-3 grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-1 min-w-0">
          <span className="text-accent-blue text-[11px] font-[750] leading-none uppercase">Selected window</span>
          <strong className="text-ink text-sm leading-[1.3]">{form.layer === "primary" ? "Primary" : "Secondary"} override</strong>
          <span className="text-ink-muted text-xs leading-[1.35]">
            {formatDateTime(form.startsAt)} - {formatDateTime(form.endsAt)}
          </span>
        </div>
        <Button disabled={disabled} onClick={onCancel} size="sm" variant="ghost">
          Cancel
        </Button>
      </div>
      <div className="grid items-end gap-3 lg:grid-cols-[minmax(220px,1fr)_auto]">
        <Field label="Replacement user" required>
          <Select
            className="h-10 min-h-10 py-0"
            disabled={disabled || selectableUsers.length === 0}
            onChange={(event) => onChange((current) => current ? { ...current, userId: event.target.value } : current)}
            required
            value={form.userId}
          >
            <option value="">{selectableUsers.length === 0 ? "No replacement users available" : "Select user"}</option>
            {selectableUsers.map((user) => (
              <option key={user.id} value={user.id}>{formatUserOption(user)}</option>
            ))}
          </Select>
        </Field>
        <Button className="min-h-10" disabled={!form.userId || excludedUserIds.has(form.userId)} isLoading={disabled} type="submit" variant="primary">
          Create
        </Button>
      </div>
      {error ? <ErrorState error={error} title="Could not create override" /> : null}
    </form>
  );
}

function RotationRow({
  rotation,
  userNameById,
}: {
  rotation: OnCallRotation;
  userNameById: Map<string, string>;
}) {
  const participants = [...rotation.participants]
    .sort((a, b) => a.position - b.position)
    .map((participant) => formatUser(participant.user_id, userNameById));

  return (
    <div className="bg-surface-2/55 border border-hairline-soft rounded-md items-center grid gap-2.5 grid-cols-[90px_minmax(0,1fr)] px-3 py-2.5">
      <span className="text-accent-blue text-xs font-bold uppercase">{rotation.layer}</span>
      <em className="text-ink-muted text-xs leading-[1.35] not-italic min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {participants.length > 0 ? participants.join(", ") : "Unassigned"}
      </em>
    </div>
  );
}

function RotationMemberPicker({
  disabled,
  label,
  onAdd,
  onRemove,
  onReorder,
  userIds,
  userNameById,
  users,
}: {
  disabled: boolean;
  label: string;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  onReorder: (userIds: string[]) => void;
  userIds: string[];
  userNameById: Map<string, string>;
  users: User[];
}) {
  const availableUsers = users.filter((user) => !userIds.includes(user.id));
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
  const draggedUserIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const userIdsRef = useRef(userIds);

  useEffect(() => {
    userIdsRef.current = userIds;
  }, [userIds]);

  function clearDragState() {
    draggedUserIdRef.current = null;
    setDraggedUserId(null);
  }

  function startDrag(userId: string) {
    if (disabled) return;

    draggedUserIdRef.current = userId;
    userIdsRef.current = userIds;
    setDraggedUserId(userId);
  }

  function moveDraggedUser(clientY: number) {
    const sourceUserId = draggedUserIdRef.current;

    if (disabled || !sourceUserId) {
      return;
    }

    const insertIndex = getPointerInsertIndex(listRef.current, sourceUserId, clientY);
    const nextUserIds = moveUserIdToIndex(userIdsRef.current, sourceUserId, insertIndex);

    if (areUserIdsEqual(userIdsRef.current, nextUserIds)) {
      return;
    }

    userIdsRef.current = nextUserIds;
    onReorder(nextUserIds);
  }

  useEffect(() => {
    if (!draggedUserId) return undefined;

    function handlePointerMove(event: PointerEvent) {
      event.preventDefault();
      moveDraggedUser(event.clientY);
    }

    window.addEventListener("pointerup", clearDragState);
    window.addEventListener("pointercancel", clearDragState);
    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      window.removeEventListener("pointerup", clearDragState);
      window.removeEventListener("pointercancel", clearDragState);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [draggedUserId, disabled, onReorder]);

  return (
    <Panel className="rounded-xl grid gap-3" padding="sm" tone="subtle">
      <strong className="text-ink text-sm leading-[1.3]">{label}</strong>
      <div className="grid gap-2">
        <Select
          disabled={disabled || availableUsers.length === 0}
          onChange={(event) => onAdd(event.target.value)}
          value=""
        >
          <option value="">Select user</option>
          {availableUsers.map((user) => (
            <option key={user.id} value={user.id}>{formatUserOption(user)}</option>
          ))}
        </Select>
      </div>
      {userIds.length === 0 ? (
        <span className="text-ink-subtle text-xs leading-[1.35]">No members added.</span>
      ) : (
        <ol className="grid gap-2 list-none m-0 p-0" ref={listRef}>
          {userIds.map((userId, index) => (
            <li
              className={`bg-surface-2 border rounded-md items-center grid gap-2 grid-cols-[32px_minmax(0,1fr)_auto] px-3 py-2 select-none touch-none transition-[border-color,opacity,transform] ${draggedUserId === userId ? "border-accent-blue/75 opacity-65 scale-[0.99]" : "border-hairline opacity-100"} ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
              data-rotation-member-id={userId}
              key={userId}
              onPointerDown={(event) => {
                if (disabled) return;
                if ((event.target as HTMLElement).closest("button")) return;
                event.preventDefault();
                startDrag(userId);
              }}
              title="Drag to reorder"
            >
              <span className={`text-ink-subtle text-xs font-bold tabular-nums ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}>
                {index + 1}
              </span>
              <span className="text-ink text-[13px] leading-[1.35] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {formatUser(userId, userNameById)}
              </span>
              <Button disabled={disabled} onClick={() => onRemove(userId)} size="sm" variant="ghost">
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function createOverrideColumns({
  deletingId,
  isDeleting,
  onDelete,
  schedules,
  userNameById,
}: {
  deletingId: string | undefined;
  isDeleting: boolean;
  onDelete: (override: OnCallOverride) => void;
  schedules: OnCallSchedule[];
  userNameById: Map<string, string>;
}): Array<DataTableColumn<OnCallOverride>> {
  const scheduleNameById = new Map(schedules.map((schedule) => [schedule.id, schedule.name]));

  return [
    {
      header: "Schedule",
      key: "schedule",
      render: (override) => scheduleNameById.get(override.schedule_id) ?? shortId(override.schedule_id),
    },
    {
      header: "Layer",
      key: "layer",
      render: (override) => override.layer,
      width: 120,
    },
    {
      header: "User",
      key: "user",
      render: (override) => formatUser(override.user_id, userNameById),
      width: 180,
    },
    {
      header: "Status",
      key: "status",
      render: (override) => formatOverrideStatus(override),
      width: 120,
    },
    {
      header: "Window",
      key: "window",
      render: (override) => `${formatDateTime(override.starts_at)} - ${formatDateTime(override.ends_at)}`,
      width: 280,
    },
    {
      header: "Actions",
      key: "actions",
      render: (override) => (
        <Button
          disabled={isDeleting && deletingId === override.id}
          isLoading={isDeleting && deletingId === override.id}
          onClick={() => onDelete(override)}
          size="sm"
          variant="danger"
        >
          Delete
        </Button>
      ),
      width: 100,
    },
  ];
}

function createOnCallSummary(schedules: OnCallSchedule[], overrides: OnCallOverride[]) {
  return {
    overrideCount: overrides.length,
    scheduleCount: schedules.length,
  };
}

function createCalendarPreviewWindow(mode: CalendarPreviewMode, anchorDate: Date) {
  const startsAt = new Date(anchorDate);
  startsAt.setHours(0, 0, 0, 0);

  const endsAt = new Date(startsAt);

  if (mode === "month") {
    startsAt.setDate(1);
    endsAt.setMonth(startsAt.getMonth() + 1, 1);
  } else {
    endsAt.setDate(endsAt.getDate() + 7);
  }

  return {
    ends_at: endsAt.toISOString(),
    starts_at: startsAt.toISOString(),
    step_minutes: mode === "month" ? 1440 : 60,
  };
}

function addCalendarPreviewStep(anchorDate: Date, mode: CalendarPreviewMode, direction: -1 | 1) {
  const nextDate = new Date(anchorDate);

  if (mode === "month") {
    nextDate.setDate(1);
    nextDate.setMonth(nextDate.getMonth() + direction);
  } else {
    nextDate.setDate(nextDate.getDate() + (7 * direction));
  }

  return nextDate;
}

function formatCalendarPreviewRange(
  previewWindow: ReturnType<typeof createCalendarPreviewWindow>,
  locale: string,
) {
  const startsAt = new Date(previewWindow.starts_at);
  const endsAt = new Date(previewWindow.ends_at);
  const displayEndsAt = new Date(endsAt.getTime() - 1);

  return `${formatDateOnly(startsAt, locale)} - ${formatDateOnly(displayEndsAt, locale)}`;
}

function formatDateOnly(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function createCalendarEvents(
  preview: OnCallSchedulePreview | undefined,
  schedule: OnCallSchedule,
  layer: OnCallLayer,
  mode: CalendarPreviewMode,
  userNameById: Map<string, string>,
): EventInput[] {
  const entries = preview?.entries ?? [];

  if (mode === "month") {
    return [
      ...createCalendarMonthEvents(entries, schedule, layer, userNameById),
      ...createCalendarOverrideEvents(schedule.overrides, layer, preview, mode, userNameById),
    ];
  }

  return [
    ...createCalendarWeekEvents(entries, schedule, layer, userNameById),
    ...createCalendarOverrideEvents(schedule.overrides, layer, preview, mode, userNameById),
  ];
}

function createCalendarWeekEvents(
  entries: OnCallPreviewEntry[],
  schedule: OnCallSchedule,
  layer: OnCallLayer,
  userNameById: Map<string, string>,
): EventInput[] {
  const sortedEntries = [...entries].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const overrideRanges = createLayerOverrideRanges(schedule.overrides, layer);
  const ranges: Array<{ endsAt: string; startsAt: string; userId: string | null }> = [];

  for (const entry of sortedEntries) {
    const userId = resolveRotationLayerUserId(schedule, layer, new Date(entry.starts_at));
    const entryStartsAt = new Date(entry.starts_at).getTime();
    const entryEndsAt = new Date(entry.ends_at).getTime();

    for (const segment of subtractOverrideRanges(entryStartsAt, entryEndsAt, overrideRanges)) {
      const startsAt = new Date(segment.startsAt).toISOString();
      const endsAt = new Date(segment.endsAt).toISOString();
      const currentRange = ranges[ranges.length - 1];

      if (currentRange && currentRange.userId === userId && currentRange.endsAt === startsAt) {
        currentRange.endsAt = endsAt;
        continue;
      }

      ranges.push({
        endsAt,
        startsAt,
        userId,
      });
    }
  }

  return ranges.map((range, index) => ({
    backgroundColor: range.userId ? "rgba(0, 153, 255, 0.105)" : "rgba(255, 255, 255, 0.035)",
    borderColor: range.userId ? "rgba(0, 153, 255, 0.42)" : "rgba(255, 255, 255, 0.1)",
    classNames: [
      "on-call-calendar-event",
      range.userId ? "is-assigned" : "is-unassigned",
    ],
    end: range.endsAt,
    id: `${layer}:${index}:${range.startsAt}`,
    start: range.startsAt,
    textColor: "#ffffff",
    title: formatUser(range.userId, userNameById),
  }));
}

function createLayerOverrideRanges(overrides: OnCallOverride[], layer: OnCallLayer) {
  return overrides
    .filter((override) => override.layer === layer)
    .map((override) => ({
      endsAt: new Date(override.ends_at).getTime(),
      startsAt: new Date(override.starts_at).getTime(),
    }))
    .filter((range) => Number.isFinite(range.startsAt) && Number.isFinite(range.endsAt) && range.startsAt < range.endsAt)
    .sort((left, right) => left.startsAt - right.startsAt);
}

function subtractOverrideRanges(
  startsAt: number,
  endsAt: number,
  overrideRanges: Array<{ endsAt: number; startsAt: number }>,
) {
  const segments: Array<{ endsAt: number; startsAt: number }> = [];
  let cursor = startsAt;

  for (const overrideRange of overrideRanges) {
    if (overrideRange.endsAt <= cursor) {
      continue;
    }

    if (overrideRange.startsAt >= endsAt) {
      break;
    }

    if (overrideRange.startsAt > cursor) {
      segments.push({
        endsAt: Math.min(overrideRange.startsAt, endsAt),
        startsAt: cursor,
      });
    }

    cursor = Math.max(cursor, overrideRange.endsAt);

    if (cursor >= endsAt) {
      break;
    }
  }

  if (cursor < endsAt) {
    segments.push({
      endsAt,
      startsAt: cursor,
    });
  }

  return segments;
}

function createCalendarMonthEvents(
  entries: OnCallPreviewEntry[],
  schedule: OnCallSchedule,
  layer: OnCallLayer,
  userNameById: Map<string, string>,
): EventInput[] {
  return entries.map((entry, index) => {
    const dateKey = getLocalPreviewDateKey(entry.local_starts_at) ?? entry.starts_at.slice(0, 10);
    const userId = resolveRotationLayerUserId(schedule, layer, new Date(entry.starts_at));

    return {
      allDay: true,
      backgroundColor: userId ? "rgba(0, 153, 255, 0.11)" : "rgba(255, 255, 255, 0.035)",
      borderColor: userId ? "rgba(0, 153, 255, 0.42)" : "rgba(255, 255, 255, 0.1)",
      classNames: [
        "on-call-calendar-event",
        "is-month-event",
        userId ? "is-assigned" : "is-unassigned",
      ],
      end: addDaysToDateKey(dateKey, 1),
      id: `${layer}:month:${index}:${dateKey}`,
      start: dateKey,
      textColor: "#ffffff",
      title: formatUser(userId, userNameById),
    };
  });
}

function createCalendarOverrideEvents(
  overrides: OnCallOverride[],
  layer: OnCallLayer,
  preview: OnCallSchedulePreview | undefined,
  mode: CalendarPreviewMode,
  userNameById: Map<string, string>,
): EventInput[] {
  if (!preview) {
    return [];
  }

  const previewStartsAt = new Date(preview.starts_at).getTime();
  const previewEndsAt = new Date(preview.ends_at).getTime();

  return createEffectiveOverrideSegments(overrides, layer, previewStartsAt, previewEndsAt)
    .map(({ endsAt, override, startsAt }) => ({
      allDay: mode === "month" && isFullDayRange(new Date(startsAt), new Date(endsAt)),
      backgroundColor: "rgba(255, 196, 87, 0.24)",
      borderColor: "rgba(255, 196, 87, 0.9)",
      classNames: [
        "on-call-calendar-event",
        "is-override",
      ],
      end: new Date(endsAt).toISOString(),
      id: `${layer}:override:${override.id}:${startsAt}`,
      start: new Date(startsAt).toISOString(),
      textColor: "#ffffff",
      title: `Override · ${formatUser(override.user_id, userNameById)}`,
    }));
}

function createEffectiveOverrideSegments(
  overrides: OnCallOverride[],
  layer: OnCallLayer,
  previewStartsAt: number,
  previewEndsAt: number,
) {
  const occupiedRanges: Array<{ endsAt: number; startsAt: number }> = [];
  const segments: Array<{ endsAt: number; override: OnCallOverride; startsAt: number }> = [];

  const sortedOverrides = overrides
    .filter((override) => override.layer === layer)
    .sort(compareOverridePriority);

  for (const override of sortedOverrides) {
    const startsAt = Math.max(new Date(override.starts_at).getTime(), previewStartsAt);
    const endsAt = Math.min(new Date(override.ends_at).getTime(), previewEndsAt);

    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
      continue;
    }

    const remainingSegments = subtractOverrideRanges(
      startsAt,
      endsAt,
      [...occupiedRanges].sort((left, right) => left.startsAt - right.startsAt),
    );

    for (const segment of remainingSegments) {
      segments.push({
        endsAt: segment.endsAt,
        override,
        startsAt: segment.startsAt,
      });
    }

    occupiedRanges.push({ endsAt, startsAt });
  }

  return segments.sort((left, right) => left.startsAt - right.startsAt);
}

function compareOverridePriority(left: OnCallOverride, right: OnCallOverride) {
  const createdAtDiff = parseDateTimestamp(right.created_at) - parseDateTimestamp(left.created_at);

  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  const startsAtDiff = parseDateTimestamp(right.starts_at) - parseDateTimestamp(left.starts_at);

  if (startsAtDiff !== 0) {
    return startsAtDiff;
  }

  return right.id.localeCompare(left.id);
}

function parseDateTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isFullDayRange(startsAt: Date, endsAt: Date) {
  return startsAt.getHours() === 0
    && startsAt.getMinutes() === 0
    && startsAt.getSeconds() === 0
    && endsAt.getHours() === 0
    && endsAt.getMinutes() === 0
    && endsAt.getSeconds() === 0
    && endsAt.getTime() - startsAt.getTime() >= 24 * 60 * 60 * 1000;
}

function createOverrideRangeFromSelection(
  selection: DateSelectArg,
  layer: OnCallLayer,
  mode: CalendarPreviewMode,
): CalendarOverrideRange {
  const startsAt = new Date(selection.start);
  const endsAt = new Date(selection.end);

  if (mode === "month" || selection.allDay) {
    startsAt.setHours(0, 0, 0, 0);
    endsAt.setHours(0, 0, 0, 0);
  }

  if (endsAt <= startsAt) {
    endsAt.setTime(startsAt.getTime() + 60 * 60 * 1000);
  }

  return {
    endsAt: endsAt.toISOString(),
    layer,
    startsAt: startsAt.toISOString(),
  };
}

function createOverrideRangeFromDateClick(
  click: DateClickArg,
  layer: OnCallLayer,
  mode: CalendarPreviewMode,
): CalendarOverrideRange {
  const startsAt = new Date(click.date);
  const endsAt = new Date(startsAt);

  if (mode === "month" || click.allDay) {
    startsAt.setHours(0, 0, 0, 0);
    endsAt.setDate(startsAt.getDate() + 1);
    endsAt.setHours(0, 0, 0, 0);
  } else {
    endsAt.setHours(startsAt.getHours() + 1, startsAt.getMinutes(), 0, 0);
  }

  return {
    endsAt: endsAt.toISOString(),
    layer,
    startsAt: startsAt.toISOString(),
  };
}

function getLocalPreviewDateKey(localDateTime: string) {
  return localDateTime.split(" ")[0] || null;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    return dateKey;
  }

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function renderCalendarEventContent(eventContent: EventContentArg) {
  const startsAt = eventContent.event.start?.getTime();
  const endsAt = eventContent.event.end?.getTime();
  const durationMs = typeof startsAt === "number" && typeof endsAt === "number" ? endsAt - startsAt : 0;
  const shouldShowTime = Boolean(eventContent.timeText) && durationMs > 0 && durationMs <= 2 * 60 * 60 * 1000;

  return (
    <div className="on-call-calendar-event-content">
      {shouldShowTime ? (
        <span className="on-call-calendar-event-time">{eventContent.timeText}</span>
      ) : null}
      <strong className="on-call-calendar-event-title">
        {eventContent.event.title}
      </strong>
    </div>
  );
}

function renderCalendarDayHeaderContent(date: Date, mode: CalendarPreviewMode, locale: string) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);

  if (mode === "month") {
    return <span className="on-call-calendar-day-header is-month">{weekday}</span>;
  }

  return (
    <span className="on-call-calendar-day-header">
      <span>{weekday}</span>
      <strong>{date.getDate()}</strong>
    </span>
  );
}

function createBlankScheduleForm(): ScheduleFormState {
  return {
    name: "",
    primaryUserIds: [],
    rotationInterval: 1,
    rotationType: "weekly",
    secondaryUserIds: [],
    startsAt: toLocalInputValue(new Date()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function createBlankUserOverrideForm(): UserOverrideFormState {
  return {
    endsAt: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    layer: "both",
    replacementUserId: "",
    startsAt: toLocalInputValue(new Date()),
    unavailableUserId: "",
  };
}

function createScheduleFormFromSchedule(schedule: OnCallSchedule): ScheduleFormState {
  const firstRotation = schedule.rotations[0];
  const primaryRotation = schedule.rotations.find((rotation) => rotation.layer === "primary");
  const secondaryRotation = schedule.rotations.find((rotation) => rotation.layer === "secondary");

  return {
    name: schedule.name,
    primaryUserIds: getRotationUserIds(primaryRotation),
    rotationInterval: firstRotation?.rotation_interval ?? 1,
    rotationType: firstRotation?.rotation_type ?? "weekly",
    secondaryUserIds: getRotationUserIds(secondaryRotation),
    startsAt: firstRotation ? toLocalInputValue(new Date(firstRotation.starts_at)) : toLocalInputValue(new Date()),
    timezone: schedule.timezone,
  };
}

function buildScheduleRotations(form: ScheduleFormState) {
  const sharedRotation = {
    rotation_interval: form.rotationInterval,
    rotation_type: form.rotationType,
    starts_at: new Date(form.startsAt).toISOString(),
    timezone: form.timezone,
  };

  return [
    ...(form.primaryUserIds.length > 0 ? [{
      ...sharedRotation,
      layer: "primary" as const,
      participants: form.primaryUserIds,
    }] : []),
    ...(form.secondaryUserIds.length > 0 ? [{
      ...sharedRotation,
      layer: "secondary" as const,
      participants: form.secondaryUserIds,
    }] : []),
  ];
}

function getRotationUserIds(rotation: OnCallRotation | undefined) {
  return rotation
    ? [...rotation.participants]
      .sort((a, b) => a.position - b.position)
      .map((participant) => participant.user_id)
    : [];
}

function getPointerInsertIndex(list: HTMLOListElement | null, draggedUserId: string, clientY: number) {
  if (!list) {
    return 0;
  }

  const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-rotation-member-id]"))
    .filter((row) => row.dataset.rotationMemberId !== draggedUserId);

  const targetIndex = rows.findIndex((row) => {
    const rect = row.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });

  return targetIndex === -1 ? rows.length : targetIndex;
}

function moveUserIdToIndex(userIds: string[], draggedUserId: string, insertIndex: number) {
  const fromIndex = userIds.indexOf(draggedUserId);

  if (fromIndex < 0) {
    return userIds;
  }

  const nextUserIds = userIds.filter((userId) => userId !== draggedUserId);
  const safeInsertIndex = Math.max(0, Math.min(insertIndex, nextUserIds.length));

  nextUserIds.splice(safeInsertIndex, 0, draggedUserId);
  return nextUserIds;
}

function areUserIdsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((userId, index) => userId === right[index]);
}

function createUserOverridePlans(schedules: OnCallSchedule[], form: UserOverrideFormState): UserOverridePlan[] {
  const startsAt = new Date(form.startsAt);
  const endsAt = new Date(form.endsAt);
  const startsAtMs = startsAt.getTime();
  const endsAtMs = endsAt.getTime();

  if (
    !form.unavailableUserId
    || Number.isNaN(startsAtMs)
    || Number.isNaN(endsAtMs)
    || endsAtMs <= startsAtMs
  ) {
    return [];
  }

  const layers: OnCallLayer[] = form.layer === "both" ? ["primary", "secondary"] : [form.layer];

  return schedules.flatMap((schedule) =>
    layers.flatMap((layer) => createUserOverridePlansForScheduleLayer(schedule, layer, form.unavailableUserId, startsAtMs, endsAtMs)))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

function createUserOverridePlansForScheduleLayer(
  schedule: OnCallSchedule,
  layer: OnCallLayer,
  unavailableUserId: string,
  startsAtMs: number,
  endsAtMs: number,
): UserOverridePlan[] {
  const plans: UserOverridePlan[] = [];
  let currentPlan: UserOverridePlan | null = null;
  let cursorMs = startsAtMs;
  let sampleCount = 0;
  const maxSamples = 10_000;

  while (cursorMs < endsAtMs && sampleCount < maxSamples) {
    const nextCursorMs = Math.min(getNextUserOverrideBoundaryMs(cursorMs), endsAtMs);
    const assignedUserId = resolveScheduleLayerUserId(schedule, layer, new Date(cursorMs));

    if (assignedUserId === unavailableUserId) {
      if (currentPlan && currentPlan.endsAt === new Date(cursorMs).toISOString()) {
        currentPlan.endsAt = new Date(nextCursorMs).toISOString();
      } else {
        currentPlan = {
          endsAt: new Date(nextCursorMs).toISOString(),
          layer,
          scheduleId: schedule.id,
          startsAt: new Date(cursorMs).toISOString(),
        };
        plans.push(currentPlan);
      }
    } else {
      currentPlan = null;
    }

    cursorMs = nextCursorMs;
    sampleCount += 1;
  }

  return plans;
}

function getNextUserOverrideBoundaryMs(cursorMs: number) {
  const next = new Date(cursorMs);
  const nextQuarterMinute = Math.floor(next.getMinutes() / 15) * 15 + 15;

  next.setMinutes(nextQuarterMinute, 0, 0);

  return Math.max(next.getTime(), cursorMs + 60 * 1000);
}

function collectAssignedUserIdsForOverride(schedule: OnCallSchedule, form: OverrideFormState) {
  const startsAt = new Date(form.startsAt);
  const endsAt = new Date(form.endsAt);
  const startsAtMs = startsAt.getTime();
  const endsAtMs = endsAt.getTime();
  const assignedUserIds = new Set<string>();

  if (
    Number.isNaN(startsAtMs)
    || Number.isNaN(endsAtMs)
    || endsAtMs <= startsAtMs
  ) {
    return assignedUserIds;
  }

  const stepMs = 60 * 60 * 1000;
  const maxSamples = 10_000;

  for (let cursorMs = startsAtMs, samples = 0; cursorMs < endsAtMs && samples < maxSamples; cursorMs += stepMs, samples += 1) {
    const userId = resolveScheduleLayerUserId(schedule, form.layer, new Date(cursorMs));

    if (userId) {
      assignedUserIds.add(userId);
    }
  }

  const finalUserId = resolveScheduleLayerUserId(schedule, form.layer, new Date(endsAtMs - 1));

  if (finalUserId) {
    assignedUserIds.add(finalUserId);
  }

  return assignedUserIds;
}

function resolveScheduleLayerUserId(schedule: OnCallSchedule, layer: OnCallLayer, at: Date) {
  const atMs = at.getTime();
  const activeOverride = schedule.overrides.find((override) => {
    const startsAt = new Date(override.starts_at).getTime();
    const endsAt = new Date(override.ends_at).getTime();

    return override.layer === layer && startsAt <= atMs && endsAt > atMs;
  });

  if (activeOverride) {
    return activeOverride.user_id;
  }

  const rotation = schedule.rotations.find((currentRotation) => currentRotation.layer === layer);

  if (!rotation || rotation.participants.length === 0) {
    return null;
  }

  return pickRotationParticipant(rotation, at);
}

function resolveRotationLayerUserId(schedule: OnCallSchedule, layer: OnCallLayer, at: Date) {
  const rotation = schedule.rotations.find((currentRotation) => currentRotation.layer === layer);

  if (!rotation || rotation.participants.length === 0) {
    return null;
  }

  return pickRotationParticipant(rotation, at);
}

function pickRotationParticipant(rotation: OnCallRotation, at: Date) {
  const participants = [...rotation.participants].sort((a, b) => a.position - b.position);
  const interval = Math.max(1, rotation.rotation_interval);
  const elapsedUnits = getElapsedRotationUnits(rotation, at);
  const slot = Math.floor(elapsedUnits / interval) % participants.length;

  return participants[slot]?.user_id ?? participants[0]?.user_id ?? null;
}

function getElapsedRotationUnits(rotation: OnCallRotation, at: Date) {
  const startsAt = new Date(rotation.starts_at);

  if (at <= startsAt) {
    return 0;
  }

  if (rotation.rotation_type === "custom") {
    return Math.floor((at.getTime() - startsAt.getTime()) / (60 * 60 * 1000));
  }

  const elapsedDays = getElapsedCalendarDays(startsAt, at, rotation.timezone);

  return rotation.rotation_type === "weekly" ? Math.floor(elapsedDays / 7) : elapsedDays;
}

function getElapsedCalendarDays(start: Date, end: Date, timezone: string) {
  const startDate = getLocalDateParts(start, timezone);
  const endDate = getLocalDateParts(end, timezone);
  const startUtcDay = Date.UTC(startDate.year, startDate.month - 1, startDate.day);
  const endUtcDay = Date.UTC(endDate.year, endDate.month - 1, endDate.day);

  return Math.max(0, Math.floor((endUtcDay - startUtcDay) / (24 * 60 * 60 * 1000)));
}

function getLocalDateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    day: getPart("day"),
    month: getPart("month"),
    year: getPart("year"),
  };
}

function createUserIdSetKey(userIds: Set<string>) {
  return [...userIds].sort().join(":");
}

function collectOverrides(schedules: OnCallSchedule[]) {
  const now = Date.now();

  return schedules.flatMap((schedule) => schedule.overrides)
    .sort((a, b) => compareOverrides(a, b, now));
}

function compareOverrides(left: OnCallOverride, right: OnCallOverride, now: number) {
  const statusOrder: Record<OverrideStatus, number> = {
    active: 0,
    upcoming: 1,
    ended: 2,
  };
  const leftStatus = getOverrideStatus(left, now);
  const rightStatus = getOverrideStatus(right, now);
  const statusDiff = statusOrder[leftStatus] - statusOrder[rightStatus];

  if (statusDiff !== 0) {
    return statusDiff;
  }

  const leftStartsAt = new Date(left.starts_at).getTime();
  const rightStartsAt = new Date(right.starts_at).getTime();

  return leftStatus === "ended"
    ? rightStartsAt - leftStartsAt
    : leftStartsAt - rightStartsAt;
}

function getOverrideStatus(override: OnCallOverride, now = Date.now()): OverrideStatus {
  const startsAt = new Date(override.starts_at).getTime();
  const endsAt = new Date(override.ends_at).getTime();

  if (startsAt > now) {
    return "upcoming";
  }

  if (endsAt > now) {
    return "active";
  }

  return "ended";
}

function formatOverrideStatus(override: OnCallOverride) {
  const status = getOverrideStatus(override);

  if (status === "active") {
    return "Active";
  }

  if (status === "upcoming") {
    return "Upcoming";
  }

  return "Ended";
}

function createTeamNameMap(teams: Team[]) {
  return new Map(teams.map((team) => [team.id, team.name]));
}

function createServiceNameMap(services: Service[]) {
  return new Map(services.map((service) => [service.id, service.name]));
}

function createUserNameMap(users: User[]) {
  return new Map(users.map((user) => [user.id, user.name]));
}

function formatScheduleScope(
  schedule: OnCallSchedule,
  serviceNameById: Map<string, string>,
  teamNameById: Map<string, string>,
) {
  if (schedule.service_id) {
    return `Service: ${serviceNameById.get(schedule.service_id) ?? shortId(schedule.service_id)}`;
  }

  if (schedule.team_id) {
    return `Team: ${teamNameById.get(schedule.team_id) ?? shortId(schedule.team_id)}`;
  }

  return "Workspace schedule";
}

function formatScheduleCadence(schedule: OnCallSchedule) {
  const [firstRotation] = schedule.rotations;

  if (!firstRotation) {
    return "No rotation";
  }

  const firstStartsAt = new Date(firstRotation.starts_at).getTime();
  const hasMixedCadence = schedule.rotations.some((rotation) => (
    rotation.rotation_type !== firstRotation.rotation_type
    || rotation.rotation_interval !== firstRotation.rotation_interval
    || new Date(rotation.starts_at).getTime() !== firstStartsAt
    || rotation.timezone !== firstRotation.timezone
  ));

  return hasMixedCadence ? "Mixed cadence" : formatRotationCadence(firstRotation);
}

function formatRotationCadence(rotation: OnCallRotation) {
  if (rotation.rotation_interval === 1) return rotation.rotation_type;
  return `${rotation.rotation_interval} ${rotation.rotation_type} intervals`;
}

function formatUser(userId: string | null, userNameById: Map<string, string>) {
  if (!userId) return "Unassigned";
  return userNameById.get(userId) ?? shortId(userId);
}

function formatUserOption(user: User) {
  return user.name === user.email ? user.email : `${user.name} (${user.email})`;
}

function toLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
